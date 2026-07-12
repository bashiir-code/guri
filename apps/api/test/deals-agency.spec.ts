import { describe, expect, it } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DealStateService } from '../src/deals/deal-state.service';
import { DealsService } from '../src/deals/deals.service';
import { ListingsService } from '../src/listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { StorageService } from '../src/storage/storage.service';
import type { AuditService } from '../src/audit/audit.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { AgencyContext } from '../src/auth/agency.guard';

const LISTING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const AGENCY_A: AgencyContext = { agencyId: 'agency-a', roles: ['agent'], canVerify: false };
const AGENCY_B: AgencyContext = { agencyId: 'agency-b', roles: ['admin'], canVerify: true };
const AGENT = 'agent-user-1';
const RESERVING = ['viewing_scheduled', 'awaiting_docs', 'docs_in_review', 'approved'];

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
    agencyId: AGENCY_A.agencyId,
    status: 'available' as string,
    publishedAt: new Date(),
    photos: [] as string[],
    district: 'Hodan',
    neighborhood: null,
    rentUsd: 450,
    agency: { name: 'Hodan Homes', phone: '+252612000000' },
  };
  const deals: DealRow[] = [];
  const events: Array<{
    dealId: string;
    fromState: string | null;
    toState: string;
    actorId: string | null;
    createdAt: Date;
  }> = [];
  const statusWrites: string[] = [];
  const customers: Record<string, { id: string; name: string; phone: string | null }> = {};

  const matchesIn = (value: string, filter?: { in: string[] }) =>
    !filter || filter.in.includes(value);

  const prisma = {
    listing: {
      findFirst: async ({ where }: { where: { id: string; agencyId?: string } }) => {
        if (where.id !== listing.id) return null;
        if (where.agencyId && where.agencyId !== listing.agencyId) return null;
        return listing;
      },
      update: async ({ data }: { data: { status: string } }) => {
        statusWrites.push(data.status);
        listing.status = data.status;
        return listing;
      },
    },
    deal: {
      findFirst: async ({
        where,
      }: {
        where: {
          id?: string | { not: string };
          customerId?: string;
          listingId?: string;
          state?: { in: string[] };
          listing?: { agencyId: string };
        };
      }) => {
        // agency-scoped single deal fetch (findAgencyDeal)
        if (typeof where.id === 'string' && where.listing) {
          const d = deals.find((x) => x.id === where.id);
          if (!d || listing.agencyId !== where.listing.agencyId) return null;
          return { ...d, listing, customer: customers[d.customerId] };
        }
        // duplicate-open check
        if (where.customerId) {
          return (
            deals.find(
              (d) => d.customerId === where.customerId && matchesIn(d.state, where.state),
            ) ?? null
          );
        }
        // active-slot check
        if (where.listingId) {
          const notId = typeof where.id === 'object' ? where.id.not : undefined;
          return (
            deals.find(
              (d) =>
                d.listingId === where.listingId &&
                d.id !== notId &&
                matchesIn(d.state, where.state),
            ) ?? null
          );
        }
        return null;
      },
      // return a snapshot, like real Prisma — not a live reference
      findUnique: async ({ where }: { where: { id: string } }) => {
        const d = deals.find((x) => x.id === where.id);
        return d ? { ...d } : null;
      },
      findMany: async ({ where }: { where: { listingId: string; state: string } }) =>
        deals
          .filter((d) => d.listingId === where.listingId && d.state === where.state)
          .map((d) => ({ ...d, customer: customers[d.customerId] })),
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
        return d;
      },
      count: async ({ where }: { where: { listingId: string; state: { in: string[] } } }) =>
        deals.filter((d) => d.listingId === where.listingId && matchesIn(d.state, where.state))
          .length,
    },
    dealEvent: {
      create: async ({ data }: { data: Omit<(typeof events)[number], 'createdAt'> }) => {
        const row = { ...data, createdAt: new Date() };
        events.push(row);
        return row;
      },
    },
    lease: { count: async () => 0 },
    agencyMember: { findMany: async () => [], findFirst: async () => null },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };

  const storageStub = { presignGet: async () => 'https://x' } as unknown as StorageService;
  const auditStub = { log: async () => undefined } as unknown as AuditService;
  const notified: string[] = [];
  const notificationsStub = {
    recordInApp: async () => undefined,
    sendSms: async (input: { template: string }) => {
      notified.push(input.template);
    },
  } as unknown as NotificationsService;

  const listingsService = new ListingsService(
    prisma as unknown as PrismaService,
    storageStub,
    auditStub,
    notificationsStub,
  );
  const dealState = new DealStateService(
    prisma as unknown as PrismaService,
    listingsService,
    notificationsStub,
    auditStub,
  );
  const dealsService = new DealsService(
    prisma as unknown as PrismaService,
    storageStub,
    dealState,
  );

  const addCustomer = (id: string, name: string) => {
    customers[id] = { id, name, phone: '+252600000000' };
  };
  return { dealState, dealsService, deals, events, statusWrites, listing, notified, addCustomer };
}

async function twoRequests(w: ReturnType<typeof makeWorld>) {
  w.addCustomer('cust-1', 'Khadra');
  w.addCustomer('cust-2', 'Liban');
  const d1 = await w.dealState.createRequest(LISTING_ID, 'cust-1');
  const d2 = await w.dealState.createRequest(LISTING_ID, 'cust-2');
  return { d1, d2 };
}

describe('phase 3 — agency deal engine (§4)', () => {
  it('1. select flips the listing to reserved via the derivation, not a direct write', async () => {
    const w = makeWorld();
    const { d1 } = await twoRequests(w);
    expect(w.listing.status).toBe('available'); // requests never reserve
    const updated = await w.dealState.select(AGENCY_A, AGENT, d1.id, new Date('2026-07-15T10:00:00Z'));
    expect(updated.state).toBe('viewing_scheduled');
    expect(updated.agentId).toBe(AGENT);
    // the only status writes came from recomputeStatus, ending at reserved
    expect(w.statusWrites.at(-1)).toBe('reserved');
    expect(w.listing.status).toBe('reserved');
    expect(w.notified).toContain('viewing_scheduled');
  });

  it('2. a second select on the same listing returns 409', async () => {
    const w = makeWorld();
    const { d1, d2 } = await twoRequests(w);
    await w.dealState.select(AGENCY_A, AGENT, d1.id, new Date());
    await expect(w.dealState.select(AGENCY_A, AGENT, d2.id, new Date())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(w.deals.find((d) => d.id === d2.id)!.state).toBe('requested');
  });

  it('3. new requests are still accepted while the listing is reserved', async () => {
    const w = makeWorld();
    const { d1 } = await twoRequests(w);
    await w.dealState.select(AGENCY_A, AGENT, d1.id, new Date());
    w.addCustomer('cust-3', 'Cali');
    const d3 = await w.dealState.createRequest(LISTING_ID, 'cust-3');
    expect(d3.state).toBe('requested');
    expect(w.listing.status).toBe('reserved'); // unchanged by the new request
  });

  it('4. no_show / declined release the listing and keep the queue intact', async () => {
    for (const result of ['no_show', 'declined'] as const) {
      const w = makeWorld();
      const { d1, d2 } = await twoRequests(w);
      await w.dealState.select(AGENCY_A, AGENT, d1.id, new Date());
      const done = await w.dealState.viewingOutcome(AGENCY_A, AGENT, d1.id, result);
      expect(done.state).toBe(result === 'no_show' ? 'no_show' : 'declined');
      expect(w.listing.status).toBe('available'); // released, derived
      expect(w.deals.find((d) => d.id === d2.id)!.state).toBe('requested'); // queue intact
      // and the agent can now pick the second customer
      const next = await w.dealState.select(AGENCY_A, AGENT, d2.id, new Date());
      expect(next.state).toBe('viewing_scheduled');
      expect(w.listing.status).toBe('reserved');
    }
  });

  it('5. another agency cannot select, record outcomes, or read the queue', async () => {
    const w = makeWorld();
    const { d1 } = await twoRequests(w);
    await expect(w.dealState.select(AGENCY_B, 'intruder', d1.id, new Date())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await w.dealState.select(AGENCY_A, AGENT, d1.id, new Date());
    await expect(
      w.dealState.viewingOutcome(AGENCY_B, 'intruder', d1.id, 'no_show'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.dealsService.listingQueue(AGENCY_B, LISTING_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // (customers are stopped earlier still: AgencyGuard 403s non-staff)
  });

  it('6. every transition wrote a deal_events row with actor and timestamp', async () => {
    const w = makeWorld();
    const { d1 } = await twoRequests(w);
    await w.dealState.select(AGENCY_A, AGENT, d1.id, new Date());
    await w.dealState.reschedule(AGENCY_A, AGENT, d1.id, new Date());
    await w.dealState.viewingOutcome(AGENCY_A, AGENT, d1.id, 'proceed');

    const d1Events = w.events.filter((e) => e.dealId === d1.id);
    expect(d1Events.map((e) => `${e.fromState ?? '∅'}→${e.toState}`)).toEqual([
      '∅→requested',
      'requested→viewing_scheduled',
      'viewing_scheduled→viewing_scheduled',
      'viewing_scheduled→awaiting_docs',
    ]);
    for (const e of d1Events) {
      expect(e.actorId).toBeTruthy();
      expect(e.createdAt).toBeInstanceOf(Date);
    }
    expect(w.events).toHaveLength(5); // + cust-2's creation event
  });
});
