import { Injectable, Logger } from '@nestjs/common';
import { DEAL_TIMERS } from '@guri/shared';
import type { DealState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DealStateService } from '../deals/deal-state.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { IntakesService } from '../intakes/intakes.service';

const HOUR = 3_600_000;
const DAY = 86_400_000;

// customer_documents from deals that never closed are purged after 90 days
// (§9). CLOSED-deal documents are kept.
const PURGE_DEAL_STATES: DealState[] = [
  'expired',
  'withdrawn',
  'declined_by_agency',
  'no_show',
  'declined',
  'docs_rejected',
];
const DOC_RETENTION_DAYS = 90;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

// The background job runner (§8): a tick every 15 minutes executes the §4
// deal timers and §16 lease timers. Every state change goes through the
// DealStateService — a job is just another caller, never a direct writer
// (rule 2). Timers NUDGE; they NEVER auto-terminate a tenancy (rule 7): the
// only lease status a timer may set is `ending_soon`.
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dealState: DealStateService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly intakes: IntakesService,
  ) {}

  // one 15-minute tick — each part isolated so one failure can't stop the rest
  async runTick(now: Date = new Date()): Promise<void> {
    for (const step of [
      () => this.expireStaleRequests(now),
      () => this.nudgeOverdueViewings(now),
      () => this.expireStuckViewings(now),
      () => this.remindDocumentReviewers(now),
      () => this.markLeasesEndingSoon(now),
      () => this.nudgeGraceWindowLeases(now),
      // §15: submitted intakes with no agency response in 5 days → expired,
      // owner prompted to reassign. Goes through the intake state machine.
      () => this.intakes.expireStaleSubmitted(now),
    ]) {
      try {
        await step();
      } catch (e) {
        this.logger.error(`tick step failed: ${String(e)}`);
      }
    }
  }

  // §4: deal in 'requested', untouched 14 days → 'expired', notify customer.
  async expireStaleRequests(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - DEAL_TIMERS.requestedExpiresAfterHours * HOUR);
    const stale = await this.prisma.deal.findMany({
      where: { state: 'requested', createdAt: { lt: cutoff } },
      include: { customer: { select: { id: true, phone: true, locale: true } } },
    });
    for (const d of stale) {
      await this.dealState.transition(d.id, 'expire', null, 'expired_untouched_14d');
      await this.notifications.notify({
        userId: d.customer.id,
        phone: d.customer.phone,
        locale: d.customer.locale,
        template: 'deal_expired',
        dedupeKey: `deal_expired:${d.id}`,
      });
    }
    return stale.length;
  }

  // §4: viewing time passed, no outcome recorded, +72h → nudge the assigned
  // agent (daily, until the 7-day hard expiry below takes over).
  async nudgeOverdueViewings(now: Date): Promise<number> {
    const nudgeAfter = new Date(now.getTime() - DEAL_TIMERS.viewingOutcomeNudgeAfterHours * HOUR);
    const hardExpiry = new Date(now.getTime() - DEAL_TIMERS.viewingStuckExpiresAfterHours * HOUR);
    const overdue = await this.prisma.deal.findMany({
      where: {
        state: 'viewing_scheduled',
        agentId: { not: null },
        viewingAt: { lt: nudgeAfter, gte: hardExpiry },
      },
      include: {
        agent: { select: { id: true, phone: true, locale: true } },
        listing: { select: { agency: { select: { phone: true } } } },
      },
    });
    for (const d of overdue) {
      if (!d.agent) continue;
      await this.notifications.notify({
        userId: d.agent.id,
        phone: d.agent.phone,
        locale: d.agent.locale,
        template: 'viewing_outcome_nudge',
        params: { agencyPhone: d.listing.agency.phone },
        dedupeKey: `viewing_nudge:${d.id}:${dayKey(now)}`,
      });
    }
    return overdue.length;
  }

  // §4: deal stuck in 'viewing_scheduled', 7 days past viewing_at → expire the
  // DEAL (not a lease) and auto-release the listing, notify both parties.
  async expireStuckViewings(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - DEAL_TIMERS.viewingStuckExpiresAfterHours * HOUR);
    const stuck = await this.prisma.deal.findMany({
      where: { state: 'viewing_scheduled', viewingAt: { lt: cutoff } },
      include: {
        customer: { select: { id: true, phone: true, locale: true } },
        agent: { select: { id: true, phone: true, locale: true } },
      },
    });
    for (const d of stuck) {
      // transition('expire') from viewing_scheduled → expired; recompute
      // releases the listing (other 'requested' deals stay queued).
      await this.dealState.transition(d.id, 'expire', null, 'expired_stuck_viewing_7d');
      await this.notifications.notify({
        userId: d.customer.id,
        phone: d.customer.phone,
        locale: d.customer.locale,
        template: 'deal_expired_stuck',
        dedupeKey: `deal_expired:${d.id}`,
      });
      if (d.agent) {
        await this.notifications.notify({
          userId: d.agent.id,
          phone: d.agent.phone,
          locale: d.agent.locale,
          template: 'deal_expired_stuck',
          dedupeKey: `deal_expired_agent:${d.id}`,
        });
      }
    }
    return stuck.length;
  }

  // §4: deal in 'docs_in_review' 48h → remind the agency's can_verify members.
  async remindDocumentReviewers(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - DEAL_TIMERS.docsInReviewReminderAfterHours * HOUR);
    const stalled = await this.prisma.deal.findMany({
      where: { state: 'docs_in_review', updatedAt: { lt: cutoff } },
      include: { listing: { select: { agencyId: true } } },
    });
    let count = 0;
    for (const d of stalled) {
      const verifiers = await this.prisma.agencyMember.findMany({
        where: { agencyId: d.listing.agencyId, active: true, canVerify: true },
        include: { user: { select: { id: true, phone: true, locale: true } } },
        distinct: ['userId'],
      });
      for (const v of verifiers) {
        await this.notifications.notify({
          userId: v.user.id,
          phone: v.user.phone,
          locale: v.user.locale,
          template: 'docs_review_reminder',
          dedupeKey: `docs_reminder:${d.id}:${v.user.id}:${dayKey(now)}`,
        });
        count += 1;
      }
    }
    return count;
  }

  // §16: 30 days before end_date → lease 'active' → 'ending_soon'; notify
  // tenant, agency, AND owner. This is the ONLY lease status change a timer
  // makes — it never ends or vacates.
  async markLeasesEndingSoon(now: Date): Promise<number> {
    const threshold = new Date(now.getTime() + DEAL_TIMERS.leaseEndingSoonBeforeDays * DAY);
    const leases = await this.prisma.lease.findMany({
      where: { status: 'active', endDate: { lte: threshold } },
      include: {
        customer: { select: { id: true, phone: true, locale: true } },
        listing: {
          select: {
            agencyId: true,
            owner: { select: { user: { select: { id: true, phone: true, locale: true } } } },
          },
        },
      },
    });
    for (const l of leases) {
      await this.dealState.markLeaseEndingSoon(l.id); // active → ending_soon (stays rented)
      const endDate = dayKey(l.endDate);
      // tenant
      await this.notifications.notify({
        userId: l.customer.id,
        phone: l.customer.phone,
        locale: l.customer.locale,
        template: 'lease_ending_soon',
        params: { endDate },
        dedupeKey: `lease_ending_soon:${l.id}:tenant`,
      });
      // owner
      const owner = l.listing.owner.user;
      await this.notifications.notify({
        userId: owner.id,
        phone: owner.phone,
        locale: owner.locale,
        template: 'lease_ending_soon',
        params: { endDate },
        dedupeKey: `lease_ending_soon:${l.id}:owner`,
      });
      // agency staff
      await this.notifyAgency(l.listing.agencyId, 'lease_ending_soon', { endDate }, `lease_ending_soon:${l.id}:agency`);
    }
    return leases.length;
  }

  // §16 GRACE WINDOW: end_date reached with no decision → lease STAYS
  // 'ending_soon', listing STAYS 'rented', nudge the agency DAILY. Never ends.
  async nudgeGraceWindowLeases(now: Date): Promise<number> {
    const overdue = await this.prisma.lease.findMany({
      where: { status: 'ending_soon', endDate: { lt: now } },
      include: { listing: { select: { agencyId: true } } },
    });
    for (const l of overdue) {
      await this.notifyAgency(
        l.listing.agencyId,
        'lease_grace_nudge',
        { endDate: dayKey(l.endDate) },
        `lease_grace:${l.id}:${dayKey(now)}`,
      );
    }
    return overdue.length;
  }

  private async notifyAgency(
    agencyId: string,
    template: string,
    params: Record<string, string>,
    dedupePrefix: string,
  ) {
    const members = await this.prisma.agencyMember.findMany({
      where: { agencyId, active: true },
      include: { user: { select: { id: true, phone: true, locale: true } } },
      distinct: ['userId'],
    });
    for (const m of members) {
      await this.notifications.notify({
        userId: m.user.id,
        phone: m.user.phone,
        locale: m.user.locale,
        template,
        params,
        dedupeKey: `${dedupePrefix}:${m.user.id}`,
      });
    }
  }

  // §9 retention: purge customer_documents from deals that never closed after
  // 90 days; keep CLOSED-deal documents. Deletes the encrypted object too.
  async purgeExpiredDocuments(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - DOC_RETENTION_DAYS * DAY);
    const docs = await this.prisma.customerDocument.findMany({
      where: { createdAt: { lt: cutoff }, deal: { state: { in: PURGE_DEAL_STATES } } },
      select: { id: true, fileKey: true },
    });
    for (const doc of docs) {
      try {
        await this.storage.deleteObject(doc.fileKey);
      } catch (e) {
        this.logger.warn(`could not delete object ${doc.fileKey}: ${String(e)}`);
      }
      await this.prisma.customerDocument.delete({ where: { id: doc.id } });
    }
    if (docs.length) this.logger.log(`purged ${docs.length} expired customer documents`);
    return docs.length;
  }

  // §8 weekly orphan-file sweep: delete bucket objects no DB row references.
  async cleanupOrphanFiles(): Promise<number> {
    const [listings, ownerDocs, custDocs, agreements, intakes] = await Promise.all([
      this.prisma.listing.findMany({ select: { photos: true } }),
      this.prisma.ownerDocument.findMany({ select: { fileKey: true } }),
      this.prisma.customerDocument.findMany({ select: { fileKey: true } }),
      this.prisma.agreement.findMany({ select: { pdfKey: true, signedScanKey: true } }),
      // §15: intake photos/docs live under their own prefixes and are referenced
      // by the intake row (which persists as history) — never sweep them away.
      this.prisma.intake.findMany({ select: { photos: true, docs: true } }),
    ]);
    const referenced = new Set<string>();
    listings.forEach((l) => l.photos.forEach((k) => referenced.add(k)));
    ownerDocs.forEach((d) => referenced.add(d.fileKey));
    custDocs.forEach((d) => referenced.add(d.fileKey));
    agreements.forEach((a) => {
      referenced.add(a.pdfKey);
      if (a.signedScanKey) referenced.add(a.signedScanKey);
    });
    intakes.forEach((i) => {
      i.photos.forEach((k) => referenced.add(k));
      i.docs.forEach((k) => referenced.add(k));
    });

    let removed = 0;
    for (const prefix of [
      'photos/',
      'owner-docs/',
      'customer-docs/',
      'agreements/',
      'intake-photos/',
      'intake-docs/',
    ]) {
      const keys = await this.storage.listKeys(prefix).catch(() => [] as string[]);
      for (const key of keys) {
        if (!referenced.has(key)) {
          await this.storage.deleteObject(key).catch(() => undefined);
          removed += 1;
        }
      }
    }
    if (removed) this.logger.log(`orphan sweep removed ${removed} files`);
    return removed;
  }
}
