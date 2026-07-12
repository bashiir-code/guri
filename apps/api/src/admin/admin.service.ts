import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateAgencyInput, PatchAgencyInput } from '@guri/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Platform admin creates the agency and its first admin user (§2, §5).
  // Created directly by the platform admin → active immediately.
  async createAgency(actorId: string, input: CreateAgencyInput) {
    const agency = await this.prisma.$transaction(async (tx) => {
      // The first admin is provisioned by email; their Clerk sign-in links to
      // this row via the webhook (rule 13). Phone stays contact data.
      let adminUser = await tx.user.findUnique({ where: { email: input.adminEmail } });
      if (!adminUser) {
        adminUser = await tx.user.create({
          data: { email: input.adminEmail, name: input.adminName, phone: input.adminPhone },
        });
      }
      const created = await tx.agency.create({
        data: {
          name: input.name,
          phone: input.phone,
          districts: input.districts,
          status: 'active',
          // The founding admin can verify — a one-person agency must be able
          // to run and verify deals from one account (§2/§4).
          members: { create: { userId: adminUser.id, role: 'admin', canVerify: true } },
        },
        include: { members: { include: { user: { select: { email: true, name: true } } } } },
      });
      return created;
    });

    await this.audit.log({
      actorId,
      action: 'agency.created',
      objectType: 'agency',
      objectId: agency.id,
      meta: { name: agency.name, adminEmail: input.adminEmail },
    });
    return agency;
  }

  async listAgencies() {
    return this.prisma.agency.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { members: true, listings: true } } },
    });
  }

  async patchAgency(actorId: string, id: string, input: PatchAgencyInput) {
    const agency = await this.prisma.agency.findUnique({ where: { id } });
    if (!agency) throw new NotFoundException('agency_not_found');
    const updated = await this.prisma.agency.update({
      where: { id },
      data: { status: input.status },
    });
    await this.audit.log({
      actorId,
      action: `agency.${input.status}`,
      objectType: 'agency',
      objectId: id,
    });
    return updated;
  }

  // §5/§9 Audit view — the fraud-oversight surface. Full deal_events timeline,
  // the customer ID documents (metadata), and the audit_log ACCESS log: who
  // viewed which document, when. Read-only; admin never edits.
  async dealAudit(dealId: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        listing: { select: { id: true, district: true, neighborhood: true, agency: { select: { name: true } } } },
        customer: { select: { name: true, phone: true, email: true } },
        events: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { name: true, email: true } } } },
        documents: { orderBy: { createdAt: 'asc' } },
        agreement: true,
      },
    });
    if (!deal) throw new NotFoundException('deal_not_found');

    const objectIds = [
      deal.id,
      ...deal.documents.map((d) => d.id),
      ...(deal.agreement ? [deal.agreement.id] : []),
    ];
    const accessLog = await this.prisma.auditLog.findMany({
      where: { objectId: { in: objectIds } },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { name: true, email: true } } },
    });

    return {
      deal: {
        id: deal.id,
        state: deal.state,
        listing: {
          id: deal.listing.id,
          district: deal.listing.district,
          neighborhood: deal.listing.neighborhood,
          agency: deal.listing.agency.name,
        },
        customer: deal.customer,
      },
      timeline: deal.events.map((e) => ({
        fromState: e.fromState,
        toState: e.toState,
        actor: e.actor?.name ?? e.actor?.email ?? 'system',
        note: e.note,
        at: e.createdAt,
      })),
      documents: deal.documents.map((d) => ({
        id: d.id,
        idType: d.idType,
        capturedVia: d.capturedVia,
        status: d.status,
        uploadedAt: d.createdAt,
      })),
      // "who viewed which ID / agreement, when" (§9)
      accessLog: accessLog
        .filter((a) => a.action.endsWith('url_issued') || a.action.startsWith('deal.verify'))
        .map((a) => ({
          action: a.action,
          actor: a.actor?.name ?? a.actor?.email ?? 'system',
          objectType: a.objectType,
          meta: a.meta,
          at: a.createdAt,
        })),
    };
  }

  // §5/§13 Metrics — listings by status, the requested→viewed→closed funnel,
  // and median days-to-rent, per agency.
  async metrics() {
    const agencies = await this.prisma.agency.findMany({ orderBy: { name: 'asc' } });
    const rows = [];
    for (const agency of agencies) {
      const [listings, deals, viewedDeals, leases] = await Promise.all([
        this.prisma.listing.findMany({
          where: { agencyId: agency.id },
          select: { id: true, status: true, publishedAt: true },
        }),
        this.prisma.deal.findMany({
          where: { listing: { agencyId: agency.id } },
          select: { id: true, state: true },
        }),
        this.prisma.dealEvent.findMany({
          where: { toState: 'viewing_scheduled', deal: { listing: { agencyId: agency.id } } },
          select: { dealId: true },
          distinct: ['dealId'],
        }),
        this.prisma.lease.findMany({
          where: { listing: { agencyId: agency.id } },
          select: { createdAt: true, listingId: true },
        }),
      ]);

      const byStatus = { draft: 0, available: 0, reserved: 0, rented: 0 };
      const publishedAt = new Map<string, Date | null>();
      for (const l of listings) {
        publishedAt.set(l.id, l.publishedAt);
        if (!l.publishedAt) byStatus.draft += 1;
        else byStatus[l.status] += 1;
      }

      // days from listed → rented, median across this agency's leases
      const daysToRent: number[] = [];
      for (const lease of leases) {
        const pub = publishedAt.get(lease.listingId);
        if (pub) daysToRent.push((lease.createdAt.getTime() - pub.getTime()) / 86_400_000);
      }

      rows.push({
        agencyId: agency.id,
        name: agency.name,
        status: agency.status,
        listingsByStatus: byStatus,
        funnel: {
          requested: deals.length,
          viewed: viewedDeals.length,
          closed: deals.filter((d) => d.state === 'closed').length,
        },
        medianDaysToRent: median(daysToRent),
      });
    }
    return { agencies: rows };
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(m * 10) / 10;
}
