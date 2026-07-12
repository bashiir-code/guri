import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEAL_OPEN_STATES,
  DEAL_RESERVING_STATES,
  LEASE_LIVE_STATUSES,
  findDealTransition,
  findLeaseTransition,
  leaseEndDate,
  type CloseDealInput,
  type DealAction,
  type EndLeaseInput,
  type RenewLeaseInput,
  type ViewingOutcome,
} from '@guri/shared';
import type { Deal, DealState, Lease, LeaseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListingsService } from '../listings/listings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AgencyContext } from '../auth/agency.guard';

const RESERVING = DEAL_RESERVING_STATES as unknown as DealState[];
const LEASE_LIVE = LEASE_LIVE_STATUSES as unknown as LeaseStatus[];

// THE deal state machine (CLAUDE.md rule 2): every deal creation and
// transition goes through here — validated against the shared §4 table,
// written to deal_events, listing status recomputed, notifications enqueued.
// No controller touches deals.state directly.
@Injectable()
export class DealStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: ListingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // "— | Customer requests a listing | requested" (§4).
  async createRequest(listingId: string, customerId: string): Promise<Deal> {
    // The queue keeps accepting requests even while the listing is reserved
    // (§4 footnote) — only rented/unpublished listings refuse.
    const listing = await this.prisma.listing.findFirst({
      where: {
        id: listingId,
        publishedAt: { not: null },
        status: { in: ['available', 'reserved'] },
      },
    });
    if (!listing) throw new NotFoundException('listing_not_available');

    // 409 if this customer already has an open deal here (§6).
    const open = await this.prisma.deal.findFirst({
      where: {
        listingId,
        customerId,
        state: { in: DEAL_OPEN_STATES as unknown as DealState[] },
      },
    });
    if (open) throw new ConflictException('request_already_open');

    const transition = findDealTransition(null, 'request');
    if (!transition) throw new ConflictException('invalid_transition');

    const deal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.deal.create({
        data: { listingId, customerId, state: transition.to },
      });
      await tx.dealEvent.create({
        data: {
          dealId: created.id,
          fromState: null,
          toState: transition.to,
          actorId: customerId,
        },
      });
      return created;
    });

    // Derived status recompute — a bare request does NOT reserve (§3/§4).
    await this.listings.recomputeStatus(listingId);

    // "agency notified" (§4) — in-app rows now; SMS digest is phase 7 (§7).
    const staff = await this.prisma.agencyMember.findMany({
      where: { agencyId: listing.agencyId, active: true },
      select: { userId: true },
      distinct: ['userId'],
    });
    await Promise.all(
      staff.map((m) =>
        this.notifications.recordInApp({
          userId: m.userId,
          template: 'new_request',
          payload: { dealId: deal.id, listingId },
        }),
      ),
    );
    return deal;
  }

  // Generic transition: validates against the §4 table, writes the
  // deal_events row, recomputes derived listing status.
  async transition(
    dealId: string,
    action: DealAction,
    actorId: string | null,
    note?: string,
    dealData?: Pick<Prisma.DealUncheckedUpdateInput, 'viewingAt' | 'agentId' | 'outcomeReason'>,
  ): Promise<Deal> {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) throw new NotFoundException('deal_not_found');

    const t = findDealTransition(deal.state, action);
    if (!t) throw new ConflictException('invalid_transition');

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.deal.update({
        where: { id: deal.id },
        data: { state: t.to, ...dealData },
      });
      await tx.dealEvent.create({
        data: {
          dealId: deal.id,
          fromState: deal.state,
          toState: t.to,
          actorId,
          note,
        },
      });
      return u;
    });

    await this.listings.recomputeStatus(deal.listingId);
    return updated;
  }

  // §16 lease transition — the ONLY status change a timer may make (rule 7):
  // active → ending_soon. It NEVER ends/vacates; the listing stays `rented`
  // because ending_soon is a live status. renew/move-out are human actions
  // (phase 8), not here.
  async markLeaseEndingSoon(leaseId: string): Promise<Lease> {
    const lease = await this.prisma.lease.findUnique({ where: { id: leaseId } });
    if (!lease) throw new NotFoundException('lease_not_found');
    const t = findLeaseTransition(lease.status, 'mark_ending_soon');
    if (!t) throw new ConflictException('invalid_lease_transition');

    const updated = await this.prisma.lease.update({
      where: { id: leaseId },
      data: { status: t.to }, // 'ending_soon'
    });
    // stays rented (ending_soon is live) — recompute proves it, never writes it by hand
    await this.listings.recomputeStatus(lease.listingId);
    return updated;
  }

  private async findAgencyLease(ctx: AgencyContext, leaseId: string) {
    const lease = await this.prisma.lease.findFirst({
      where: { id: leaseId, listing: { agencyId: ctx.agencyId } },
      include: {
        customer: { select: { id: true, phone: true, locale: true } },
        listing: {
          select: {
            id: true,
            owner: { select: { user: { select: { id: true, phone: true, locale: true } } } },
          },
        },
      },
    });
    if (!lease) throw new NotFoundException('lease_not_found');
    return lease;
  }

  // §16 RENEW (human action, phase 8): the tenant stays. A NEW active lease is
  // created and linked via renewed_from_lease_id; the OLD lease becomes
  // `renewed` (no longer live) so the listing keeps exactly one live lease and
  // never leaves `rented`. Renewal is always a new row — the old lease's terms
  // are never edited (§16). Clears any grace-window state by leaving
  // ending_soon.
  async renewLease(ctx: AgencyContext, actorId: string, leaseId: string, input: RenewLeaseInput) {
    const lease = await this.findAgencyLease(ctx, leaseId);
    const t = findLeaseTransition(lease.status, 'renew');
    if (!t) throw new ConflictException('lease_not_renewable'); // only ending_soon (§16)

    const newLease = await this.prisma.$transaction(async (tx) => {
      // old → renewed (status only; terms untouched, history preserved)
      await tx.lease.update({ where: { id: lease.id }, data: { status: t.to } });
      const start = lease.endDate; // continues from the old end — no gap
      return tx.lease.create({
        data: {
          listingId: lease.listingId,
          customerId: lease.customerId,
          dealId: null, // a renewal has no originating deal
          renewedFromLeaseId: lease.id,
          startDate: start,
          termMonths: input.termMonths,
          endDate: leaseEndDate(start, input.termMonths),
          rentUsd: input.newRentUsd ?? lease.rentUsd,
          depositUsd: lease.depositUsd,
          status: 'active',
        },
      });
    });

    await this.listings.recomputeStatus(lease.listingId); // stays rented (derived)
    await this.audit.log({
      actorId,
      action: 'lease.renewed',
      objectType: 'lease',
      objectId: newLease.id,
      meta: { renewedFrom: lease.id, termMonths: input.termMonths },
    });

    // §7: lease renewed → tenant + owner (never email).
    await this.notifications.notify({
      userId: lease.customer.id,
      phone: lease.customer.phone,
      locale: lease.customer.locale,
      template: 'lease_renewed',
      dedupeKey: `lease_renewed:${newLease.id}:tenant`,
    });
    const owner = lease.listing.owner.user;
    await this.notifications.notify({
      userId: owner.id,
      phone: owner.phone,
      locale: owner.locale,
      template: 'lease_renewed',
      dedupeKey: `lease_renewed:${newLease.id}:owner`,
    });
    return newLease;
  }

  // §16 MOVE-OUT (human action): the tenant leaves. Lease → `vacated`; the
  // listing returns to `available`. Deposit return can be logged separately as
  // a payment note. Only a human hits this — a timer never does.
  async endLease(ctx: AgencyContext, actorId: string, leaseId: string, input: EndLeaseInput) {
    const lease = await this.findAgencyLease(ctx, leaseId);
    const t = findLeaseTransition(lease.status, 'record_move_out');
    if (!t) throw new ConflictException('lease_not_live');

    const updated = await this.prisma.lease.update({
      where: { id: lease.id },
      data: { status: t.to }, // 'vacated'
    });
    await this.listings.recomputeStatus(lease.listingId); // → available (derived)
    await this.audit.log({
      actorId,
      action: 'lease.vacated',
      objectType: 'lease',
      objectId: lease.id,
      meta: { note: input.note ?? null },
    });

    // §7: move-out recorded → owner.
    const owner = lease.listing.owner.user;
    await this.notifications.notify({
      userId: owner.id,
      phone: owner.phone,
      locale: owner.locale,
      template: 'move_out_recorded',
      dedupeKey: `move_out:${lease.id}`,
    });
    return updated;
  }

  // ---------- agency side (phase 3, §4/§5/§7) ----------

  private async findAgencyDeal(ctx: AgencyContext, dealId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, listing: { agencyId: ctx.agencyId } },
      include: {
        listing: { include: { agency: { select: { name: true, phone: true } } } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!deal) throw new NotFoundException('deal_not_found');
    return deal;
  }

  // Channel policy (§7): never email — SMS/WhatsApp via the adapter when a
  // phone exists, in-app always as fallback.
  private async notifyCustomer(
    customer: { id: string; phone: string | null },
    template: string,
    message: string,
    payload: Prisma.InputJsonValue,
  ) {
    if (customer.phone) {
      await this.notifications.sendSms({
        userId: customer.id,
        phone: customer.phone,
        template,
        message,
        payload,
      });
    } else {
      await this.notifications.recordInApp({ userId: customer.id, template, payload });
    }
  }

  private waLink(agencyPhone: string): string {
    return `https://wa.me/${agencyPhone.replace(/[^0-9]/g, '')}`;
  }

  // requested → viewing_scheduled. Only ONE deal per listing may hold the
  // active slot (§4: listing shows reserved; queue keeps accepting requests).
  async select(ctx: AgencyContext, actorId: string, dealId: string, viewingAt: Date) {
    const deal = await this.findAgencyDeal(ctx, dealId);

    const activeSlot = await this.prisma.deal.findFirst({
      where: {
        listingId: deal.listingId,
        id: { not: deal.id },
        state: { in: RESERVING },
      },
    });
    if (activeSlot) throw new ConflictException('listing_already_reserved');

    const updated = await this.transition(dealId, 'schedule_viewing', actorId, undefined, {
      viewingAt,
      agentId: actorId,
    });

    const when = viewingAt.toISOString();
    await this.notifyCustomer(
      deal.customer,
      'viewing_scheduled',
      `Guri: daawasho waa la qorsheeyay ${when} — ${deal.listing.agency.name}, ${deal.listing.agency.phone}, WhatsApp ${this.waLink(deal.listing.agency.phone)} — ` +
        `Guri: your viewing is scheduled for ${when} — ${deal.listing.agency.name}, ${deal.listing.agency.phone}, WhatsApp ${this.waLink(deal.listing.agency.phone)}`,
      { dealId, viewingAt: when },
    );
    return updated;
  }

  // viewing_scheduled → viewing_scheduled with a new time (§4 reschedule).
  async reschedule(ctx: AgencyContext, actorId: string, dealId: string, viewingAt: Date) {
    const deal = await this.findAgencyDeal(ctx, dealId);
    const updated = await this.transition(dealId, 'reschedule_viewing', actorId, undefined, {
      viewingAt,
    });
    const when = viewingAt.toISOString();
    await this.notifyCustomer(
      deal.customer,
      'viewing_rescheduled',
      `Guri: daawashadii waxaa loo beddelay ${when} — ${deal.listing.agency.name}, WhatsApp ${this.waLink(deal.listing.agency.phone)} — ` +
        `Guri: your viewing was moved to ${when} — ${deal.listing.agency.name}, WhatsApp ${this.waLink(deal.listing.agency.phone)}`,
      { dealId, viewingAt: when },
    );
    return updated;
  }

  // requested → declined_by_agency (§4).
  async declineRequest(ctx: AgencyContext, actorId: string, dealId: string, reason?: string) {
    const deal = await this.findAgencyDeal(ctx, dealId);
    const updated = await this.transition(dealId, 'decline_request', actorId, reason, {
      outcomeReason: reason,
    });
    await this.notifyCustomer(
      deal.customer,
      'request_declined',
      'Guri: codsigaagii waa la diiday — guri kale ka raadso Guri. — Guri: your request was declined — keep browsing for another home.',
      { dealId },
    );
    return updated;
  }

  // viewing_scheduled → no_show | declined | awaiting_docs (§4 outcomes).
  async viewingOutcome(
    ctx: AgencyContext,
    actorId: string,
    dealId: string,
    result: ViewingOutcome,
    reason?: string,
  ) {
    const deal = await this.findAgencyDeal(ctx, dealId);
    const action: DealAction =
      result === 'no_show'
        ? 'record_no_show'
        : result === 'declined'
          ? 'record_declined'
          : 'record_proceeding';

    const updated = await this.transition(dealId, action, actorId, reason, {
      outcomeReason: reason,
    });

    if (result === 'proceed') {
      // §7: "ID upload requested → customer" (upload itself is phase 4).
      await this.notifyCustomer(
        deal.customer,
        'id_upload_requested',
        'Guri: si aad u sii wadato, soo geli sawirka aqoonsigaaga app-ka. — Guri: to continue, upload a photo of your ID in the app.',
        { dealId },
      );
    } else {
      await this.notifyCustomer(
        deal.customer,
        result === 'no_show' ? 'viewing_no_show' : 'viewing_declined',
        result === 'no_show'
          ? 'Guri: daawashadii lama iman, codsigiina waa la xiray. — Guri: the viewing was missed and the request is now closed.'
          : 'Guri: waxaa la diiwaangeliyay inaadan guriga rabin. — Guri: we recorded that you passed on this home.',
        { dealId },
      );
    }
    return updated;
  }

  // approved → closed (§4): THE atomic close. Validates every §4 precondition
  // up front, then in ONE transaction creates the lease (end_date derived,
  // §16), records the payments, transitions the deal, and auto-closes every
  // other queued deal. Partial closes are impossible.
  async close(ctx: AgencyContext, actorId: string, dealId: string, input: CloseDealInput) {
    const deal = await this.findAgencyDeal(ctx, dealId);
    if (deal.state !== 'approved') throw new ConflictException('deal_not_approved');
    if (!findDealTransition('approved', 'close')) throw new ConflictException('invalid_transition');

    // one live lease per listing, ever (§16) — the fundamental invariant,
    // checked before any paperwork requirement
    const liveLease = await this.prisma.lease.findFirst({
      where: { listingId: deal.listingId, status: { in: LEASE_LIVE } },
    });
    if (liveLease) throw new ConflictException('lease_already_live');

    const agreement = await this.prisma.agreement.findUnique({ where: { dealId } });
    if (!agreement?.signedScanKey) throw new BadRequestException('signed_scan_missing');
    if (!input.payments.some((p) => p.type === 'deposit')) {
      throw new BadRequestException('deposit_payment_required');
    }
    if (!input.payments.some((p) => p.type === 'monthly_rent')) {
      throw new BadRequestException('first_rent_payment_required');
    }

    const queued = await this.prisma.deal.findMany({
      where: { listingId: deal.listingId, state: 'requested', id: { not: deal.id } },
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });

    const { lease, closedDeal } = await this.prisma.$transaction(async (tx) => {
      const createdLease = await tx.lease.create({
        data: {
          listingId: deal.listingId,
          customerId: deal.customerId,
          dealId: deal.id,
          startDate: input.startDate,
          termMonths: input.termMonths,
          endDate: leaseEndDate(input.startDate, input.termMonths),
          rentUsd: deal.listing.rentUsd,
          depositUsd: deal.listing.depositUsd,
          status: 'active',
        },
      });
      for (const p of input.payments) {
        await tx.payment.create({
          data: {
            leaseId: createdLease.id,
            type: p.type,
            amountUsd: p.amountUsd,
            paidOn: p.paidOn,
            note: p.note,
            recordedById: actorId,
          },
        });
      }
      const updated = await tx.deal.update({
        where: { id: deal.id },
        data: { state: 'closed' },
      });
      await tx.dealEvent.create({
        data: { dealId: deal.id, fromState: 'approved', toState: 'closed', actorId },
      });
      // "all other queued deals on this listing auto-close" (§4)
      for (const q of queued) {
        await tx.deal.update({
          where: { id: q.id },
          data: { state: 'expired', outcomeReason: 'listing_rented' },
        });
        await tx.dealEvent.create({
          data: {
            dealId: q.id,
            fromState: 'requested',
            toState: 'expired',
            actorId: null,
            note: 'auto_closed_listing_rented',
          },
        });
      }
      return { lease: createdLease, closedDeal: updated };
    });

    await this.listings.recomputeStatus(deal.listingId); // → rented (derived)
    await this.audit.log({
      actorId,
      action: 'deal.closed',
      objectType: 'deal',
      objectId: deal.id,
      meta: { leaseId: lease.id, termMonths: input.termMonths },
    });

    // §4 "customer signs any lease → auto-withdraw their OTHER open requests".
    // The same-listing queue was expired inside the tx above; this catches the
    // CROSS-LISTING case (their requests on other homes). Each goes through the
    // state machine so deal_events + derived release happen properly.
    await this.autoWithdrawOtherDeals(deal.customerId, deal.id);

    // §7: deal closed → customer + owner; courteous notice to the queue.
    await this.notifyCustomer(
      deal.customer,
      'deal_closed',
      'Guri: hambalyo — gurigii waa laguu xiray! Heshiiskaaga waxaad ka helaysaa app-ka. — Guri: congratulations — the home is yours! Your agreement is in the app.',
      { dealId: deal.id, leaseId: lease.id },
    );
    const owner = await this.prisma.owner.findUnique({
      where: { id: deal.listing.ownerId },
      include: { user: { select: { id: true, phone: true } } },
    });
    if (owner) {
      await this.notifyCustomer(
        owner.user,
        'deal_closed_owner',
        'Guri: gurigaagii waa la kiraystay — faahfaahinta kirada iyo lacagaha waxaad ka arki doontaa Guri. — Guri: your property has been rented — see the tenancy and payments on Guri.',
        { dealId: deal.id, leaseId: lease.id },
      );
    }
    for (const q of queued) {
      await this.notifyCustomer(
        q.customer,
        'queue_auto_closed',
        'Guri: waan ka xunnahay — gurigii aad codsatay waa la kiraystay. Guryo kale ayaa kuu diyaar ah. — Guri: sorry — the home you requested has been rented. More homes are waiting for you.',
        { dealId: q.id },
      );
    }
    return { deal: closedDeal, lease };
  }

  // Withdraw a customer's other OPEN deals when they sign a lease (§4). Used
  // by close() and callable from the job runner as a safety net. Idempotent:
  // only touches deals still in an open state.
  async autoWithdrawOtherDeals(customerId: string, exceptDealId: string): Promise<number> {
    const others = await this.prisma.deal.findMany({
      where: {
        customerId,
        id: { not: exceptDealId },
        state: { in: DEAL_OPEN_STATES as unknown as DealState[] },
      },
      include: { customer: { select: { id: true, phone: true, locale: true } } },
    });
    for (const o of others) {
      await this.transition(o.id, 'withdraw', customerId, 'auto_withdrawn_signed_elsewhere');
      await this.notifications.notify({
        userId: o.customer.id,
        phone: o.customer.phone,
        locale: o.customer.locale,
        template: 'auto_withdrawn_signed',
        params: {},
        dedupeKey: `auto_withdrawn:${o.id}`,
      });
    }
    return others.length;
  }
}
