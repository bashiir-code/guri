import { describe, expect, it } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DealStateService } from '../src/deals/deal-state.service';
import { DealsService } from '../src/deals/deals.service';
import { ListingsService } from '../src/listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { StorageService } from '../src/storage/storage.service';
import type { AuditService } from '../src/audit/audit.service';
import type { NotificationsService } from '../src/notifications/notifications.service';

const LISTING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CUSTOMER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUSTOMER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// In-memory prisma double for one published, available listing with no deals.
function makeWorld() {
  const listing = {
    id: LISTING_ID,
    agencyId: 'agency-1',
    status: 'available' as string,
    publishedAt: new Date(),
    photos: [] as string[],
  };
  const deals: Array<{ id: string; listingId: string; customerId: string; state: string }> = [];
  const dealEvents: Array<{
    dealId: string;
    fromState: string | null;
    toState: string;
    actorId: string | null;
  }> = [];
  const statusWrites: string[] = [];

  const prisma = {
    listing: {
      findFirst: async () => listing,
      update: async ({ data }: { data: { status: string } }) => {
        statusWrites.push(data.status);
        listing.status = data.status;
        return listing;
      },
    },
    deal: {
      findFirst: async ({ where }: { where: { customerId: string } }) =>
        deals.find((d) => d.customerId === where.customerId && d.state === 'requested') ?? null,
      findUnique: async ({ where }: { where: { id: string } }) => {
        const d = deals.find((x) => x.id === where.id);
        return d
          ? {
              ...d,
              listing: { id: listing.id, agencyId: listing.agencyId, district: 'Hodan', rentUsd: 450 },
              customer: { name: 'Test', phone: null },
              documents: [],
              events: [],
            }
          : null;
      },
      create: async ({ data }: { data: { listingId: string; customerId: string; state: string } }) => {
        const d = { id: `deal-${deals.length + 1}`, ...data };
        deals.push(d);
        return d;
      },
      count: async ({ where }: { where: { state: { in: string[] } } }) =>
        deals.filter((d) => where.state.in.includes(d.state)).length,
    },
    dealEvent: {
      create: async ({ data }: { data: (typeof dealEvents)[number] }) => {
        dealEvents.push(data);
        return data;
      },
    },
    lease: { count: async () => 0 },
    agencyMember: {
      findMany: async () => [],
      findFirst: async () => null,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };

  const storageStub = { presignGet: async () => 'https://x' } as unknown as StorageService;
  const auditStub = { log: async () => undefined } as unknown as AuditService;
  const notificationsStub = {
    recordInApp: async () => undefined,
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
  return { dealState, dealsService, deals, dealEvents, statusWrites, listing };
}

describe('deal request via the state machine (CLAUDE.md rule 2)', () => {
  it('creates the deal in requested and writes a deal_events row', async () => {
    const w = makeWorld();
    const deal = await w.dealState.createRequest(LISTING_ID, CUSTOMER_A);
    expect(deal.state).toBe('requested');
    expect(w.dealEvents).toHaveLength(1);
    expect(w.dealEvents[0]).toMatchObject({
      dealId: deal.id,
      fromState: null,
      toState: 'requested',
      actorId: CUSTOMER_A,
    });
  });

  it('keeps the listing available after a request (derived, not reserved)', async () => {
    const w = makeWorld();
    await w.dealState.createRequest(LISTING_ID, CUSTOMER_A);
    // status was recomputed exactly once, through the shared derivation
    expect(w.statusWrites).toEqual(['available']);
    expect(w.listing.status).toBe('available');
  });

  it('409s when the same customer already has an open deal here', async () => {
    const w = makeWorld();
    await w.dealState.createRequest(LISTING_ID, CUSTOMER_A);
    await expect(w.dealState.createRequest(LISTING_ID, CUSTOMER_A)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('party scoping (§9)', () => {
  it('a customer cannot see another customer’s deal', async () => {
    const w = makeWorld();
    const deal = await w.dealState.createRequest(LISTING_ID, CUSTOMER_A);
    // owner of the deal can read it
    const view = await w.dealsService.getDealForParty(CUSTOMER_A, deal.id);
    expect(view.viewerRole).toBe('customer');
    // a different customer (no agency membership) gets a 404
    await expect(w.dealsService.getDealForParty(CUSTOMER_B, deal.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
