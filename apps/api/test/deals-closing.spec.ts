import { describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { leaseEndDate } from '@guri/shared';
import { DealStateService } from '../src/deals/deal-state.service';
import { AgreementsService } from '../src/deals/agreements.service';
import { ListingsService } from '../src/listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { StorageService } from '../src/storage/storage.service';
import type { AuditService } from '../src/audit/audit.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { AgencyContext } from '../src/auth/agency.guard';

const LISTING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CTX: AgencyContext = { agencyId: 'agency-a', roles: ['admin'], canVerify: true };
const AGENT = 'agent-a';
const LIVE = ['active', 'ending_soon'];

interface DealRow {
  id: string;
  listingId: string;
  customerId: string;
  agentId: string | null;
  state: string;
  viewingAt: Date | null;
  outcomeReason: string | null;
  createdAt: Date;
}

function makeWorld() {
  const listing = {
    id: LISTING_ID,
    agencyId: 'agency-a',
    ownerId: 'owner-1',
    status: 'available' as string,
    publishedAt: new Date(),
    photos: [] as string[],
    rentUsd: 450,
    depositUsd: 450,
    agency: { name: 'Hodan Homes', phone: '+252612000000' },
  };
  const deals: DealRow[] = [];
  const leases: Array<Record<string, unknown>> = [];
  const payments: Array<Record<string, unknown>> = [];
  const events: Array<{ dealId: string; fromState: string | null; toState: string; actorId: string | null; note?: string }> = [];
  const auditRows: Array<{ actorId: string | null; action: string }> = [];
  const statusWrites: string[] = [];
  const notified: string[] = [];
  let agreementRow: { id: string; dealId: string; pdfKey: string; signedScanKey: string | null } | null = null;

  const customers: Record<string, { id: string; name: string; phone: string | null }> = {
    'cust-1': { id: 'cust-1', name: 'Khadra', phone: '+252600000001' },
    'cust-2': { id: 'cust-2', name: 'Liban', phone: '+252600000002' },
    'cust-3': { id: 'cust-3', name: 'Cali', phone: '+252600000003' },
  };
  const matchesIn = (v: string, f?: { in: string[] }) => !f || f.in.includes(v);

  const prisma = {
    listing: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        where.id === listing.id ? listing : null,
      update: async ({ data }: { data: { status: string } }) => {
        statusWrites.push(data.status);
        listing.status = data.status;
        return listing;
      },
    },
    deal: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (typeof where.id === 'string' && where.listing) {
          const d = deals.find((x) => x.id === where.id);
          const agencyId = (where.listing as { agencyId: string }).agencyId;
          if (!d || listing.agencyId !== agencyId) return null;
          return { ...d, listing, customer: customers[d.customerId] };
        }
        if (where.customerId) {
          return (
            deals.find(
              (d) =>
                d.customerId === where.customerId &&
                matchesIn(d.state, where.state as { in: string[] }),
            ) ?? null
          );
        }
        if (where.listingId) {
          const notId = (where.id as { not: string } | undefined)?.not;
          return (
            deals.find(
              (d) =>
                d.listingId === where.listingId &&
                d.id !== notId &&
                matchesIn(d.state, where.state as { in: string[] }),
            ) ?? null
          );
        }
        return null;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const d = deals.find((x) => x.id === where.id);
        return d
          ? { ...d, listing: { id: listing.id, agencyId: listing.agencyId }, customer: customers[d.customerId] }
          : null;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const notId = (where.id as { not: string } | undefined)?.not;
        return deals
          .filter(
            (d) =>
              d.listingId === where.listingId &&
              (!where.state || d.state === where.state) &&
              d.id !== notId,
          )
          .map((d) => ({ ...d, customer: customers[d.customerId] }));
      },
      create: async ({ data }: { data: Partial<DealRow> }) => {
        const d: DealRow = {
          id: `deal-${deals.length + 1}`,
          agentId: null,
          viewingAt: null,
          outcomeReason: null,
          createdAt: new Date(),
          ...(data as DealRow),
        };
        deals.push(d);
        return d;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<DealRow> }) => {
        const d = deals.find((x) => x.id === where.id)!;
        Object.assign(d, data);
        return { ...d };
      },
      count: async ({ where }: { where: { listingId: string; state: { in: string[] } } }) =>
        deals.filter((d) => d.listingId === where.listingId && matchesIn(d.state, where.state))
          .length,
    },
    agreement: {
      findUnique: async ({ where }: { where: { dealId: string } }) =>
        agreementRow && agreementRow.dealId === where.dealId ? { ...agreementRow } : null,
    },
    lease: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const lease = { id: `lease-${leases.length + 1}`, ...data };
        leases.push(lease);
        return lease;
      },
      findFirst: async ({ where }: { where: { listingId: string; status: { in: string[] } } }) =>
        leases.find(
          (l) => l.listingId === where.listingId && where.status.in.includes(l.status as string),
        ) ?? null,
      count: async ({ where }: { where: { listingId: string; status: { in: string[] } } }) =>
        leases.filter(
          (l) => l.listingId === where.listingId && where.status.in.includes(l.status as string),
        ).length,
    },
    payment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const p = { id: `pay-${payments.length + 1}`, ...data };
        payments.push(p);
        return p;
      },
    },
    dealEvent: {
      create: async ({ data }: { data: (typeof events)[number] }) => {
        events.push(data);
        return data;
      },
    },
    owner: {
      findUnique: async () => ({
        id: 'owner-1',
        user: { id: 'owner-user', phone: '+252611111199' },
      }),
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        email: null,
        isPlatformAdmin: false,
      }),
    },
    agencyMember: {
      findMany: async () => [],
      findFirst: async ({ where }: { where: { userId: string; agencyId?: string } }) =>
        where.userId === AGENT && (!where.agencyId || where.agencyId === 'agency-a')
          ? { userId: AGENT, agencyId: 'agency-a', active: true, canVerify: true }
          : null,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };

  const storageStub = {
    presignGet: async () => 'https://signed.example/file',
    putObject: async () => undefined,
    processPhotoToWebp: async (b: Buffer) => b,
  } as unknown as StorageService;
  const audit = {
    log: async (e: (typeof auditRows)[number]) => {
      auditRows.push(e);
    },
  } as unknown as AuditService;
  const notifications = {
    recordInApp: async () => undefined,
    sendSms: async (i: { template: string }) => {
      notified.push(i.template);
    },
  } as unknown as NotificationsService;
  const configStub = { get: () => '' } as unknown as ConfigService;

  const listingsService = new ListingsService(prisma as unknown as PrismaService, storageStub, audit, notifications);
  const dealState = new DealStateService(
    prisma as unknown as PrismaService,
    listingsService,
    notifications,
    audit,
  );
  const agreements = new AgreementsService(
    prisma as unknown as PrismaService,
    storageStub,
    audit,
    configStub,
  );

  const setAgreement = (signed: boolean) => {
    agreementRow = {
      id: 'agr-1',
      dealId: deals[0]?.id ?? 'deal-1',
      pdfKey: 'agreements/x.pdf',
      signedScanKey: signed ? 'agreements/signed.webp' : null,
    };
  };
  return {
    dealState,
    agreements,
    deals,
    leases,
    payments,
    events: events as typeof events,
    auditRows,
    statusWrites,
    listing,
    notified,
    setAgreement,
    prisma,
  };
}

const START = new Date('2026-08-01T00:00:00Z');
const closeInput = {
  termMonths: 12,
  startDate: START,
  payments: [
    { type: 'deposit' as const, amountUsd: 450, paidOn: START },
    { type: 'monthly_rent' as const, amountUsd: 450, paidOn: START },
  ],
};

// request(cust-1 + cust-2 queued) → select → proceed → submit → approve
async function reachApproved(w: ReturnType<typeof makeWorld>) {
  const d1 = await w.dealState.createRequest(LISTING_ID, 'cust-1');
  const d2 = await w.dealState.createRequest(LISTING_ID, 'cust-2');
  await w.dealState.select(CTX, AGENT, d1.id, new Date());
  await w.dealState.viewingOutcome(CTX, AGENT, d1.id, 'proceed');
  await w.dealState.transition(d1.id, 'submit_documents', 'cust-1');
  await w.dealState.transition(d1.id, 'approve_documents', AGENT);
  return { d1, d2 };
}

describe('phase 5 — atomic close (§4/§16)', () => {
  it('1. rejects without a signed scan / without deposit / without first rent / wrong state — leaving nothing behind', async () => {
    const w = makeWorld();
    const { d1 } = await reachApproved(w);
    const eventsBefore = (await Promise.resolve(w.deals)).length; // deals count stable

    // no agreement at all
    await expect(w.dealState.close(CTX, AGENT, d1.id, closeInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // agreement exists but unsigned
    w.setAgreement(false);
    await expect(w.dealState.close(CTX, AGENT, d1.id, closeInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // signed, but missing deposit
    w.setAgreement(true);
    await expect(
      w.dealState.close(CTX, AGENT, d1.id, {
        ...closeInput,
        payments: [{ type: 'monthly_rent', amountUsd: 450, paidOn: START }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // signed, but missing first rent
    await expect(
      w.dealState.close(CTX, AGENT, d1.id, {
        ...closeInput,
        payments: [{ type: 'deposit', amountUsd: 450, paidOn: START }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // nothing happened on any failure
    expect(w.leases).toHaveLength(0);
    expect(w.payments).toHaveLength(0);
    expect(w.deals.find((d) => d.id === d1.id)!.state).toBe('approved');
    expect(w.deals).toHaveLength(eventsBefore);

    // wrong state → 409
    const w2 = makeWorld();
    const fresh = await w2.dealState.createRequest(LISTING_ID, 'cust-1');
    await expect(w2.dealState.close(CTX, AGENT, fresh.id, closeInput)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('2+3. a successful close creates ONE lease (end = start + term), records both payments, writes the event, and derives rented', async () => {
    const w = makeWorld();
    const { d1 } = await reachApproved(w);
    w.setAgreement(true);

    const { lease } = await w.dealState.close(CTX, AGENT, d1.id, closeInput);

    expect(w.leases).toHaveLength(1);
    expect(lease.status).toBe('active');
    expect((lease.endDate as Date).toISOString()).toBe(
      leaseEndDate(START, 12).toISOString(),
    );
    expect(w.payments).toHaveLength(2);
    expect(w.payments.every((p) => p.recordedById === AGENT)).toBe(true);
    expect(w.deals.find((d) => d.id === d1.id)!.state).toBe('closed');
    // derived, never hand-written: last recompute produced rented
    expect(w.statusWrites.at(-1)).toBe('rented');
    expect(w.listing.status).toBe('rented');
    expect(w.auditRows.some((r) => r.action === 'deal.closed')).toBe(true);
    expect(w.notified).toContain('deal_closed');
  });

  it('4. other queued deals auto-close with a courteous notice', async () => {
    const w = makeWorld();
    const { d1, d2 } = await reachApproved(w);
    w.setAgreement(true);
    await w.dealState.close(CTX, AGENT, d1.id, closeInput);

    const queued = w.deals.find((d) => d.id === d2.id)!;
    expect(queued.state).toBe('expired');
    expect(queued.outcomeReason).toBe('listing_rented');
    expect(w.notified).toContain('queue_auto_closed');
  });

  it('5. a second close / second live lease on the listing is rejected', async () => {
    const w = makeWorld();
    const { d1 } = await reachApproved(w);
    w.setAgreement(true);
    await w.dealState.close(CTX, AGENT, d1.id, closeInput);

    // craft another approved deal on the same listing
    w.deals.push({
      id: 'deal-approved-2',
      listingId: LISTING_ID,
      customerId: 'cust-3',
      agentId: AGENT,
      state: 'approved',
      viewingAt: null,
      outcomeReason: null,
      createdAt: new Date(),
    });
    await expect(
      w.dealState.close(CTX, AGENT, 'deal-approved-2', closeInput),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(w.leases).toHaveLength(1); // still exactly one lease
  });

  it('6. agreement URLs are parties-only and every issue writes audit_log', async () => {
    const w = makeWorld();
    const { d1 } = await reachApproved(w);
    w.setAgreement(true);

    // the customer and the agency member may fetch; a stranger may not
    const forCustomer = await w.agreements.issueUrls('cust-1', d1.id);
    expect(forCustomer.pdfUrl).toContain('https://');
    expect(forCustomer.signedUrl).toContain('https://');
    await w.agreements.issueUrls(AGENT, d1.id);
    await expect(w.agreements.issueUrls('cust-2', d1.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    // 2 parts × 2 allowed callers = 4 audit rows
    const urlRows = w.auditRows.filter((r) => r.action === 'agreement.url_issued');
    expect(urlRows).toHaveLength(4);
  });
});
