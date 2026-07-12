import { describe, expect, it } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { DealStateService } from '../src/deals/deal-state.service';
import { AccountService } from '../src/account/account.service';
import { ListingsService } from '../src/listings/listings.service';
import { PlatformAdminGuard } from '../src/auth/platform-admin.guard';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { StorageService } from '../src/storage/storage.service';
import type { AuditService } from '../src/audit/audit.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { ConfigService } from '@nestjs/config';
import type { AgencyContext } from '../src/auth/agency.guard';

const CTX: AgencyContext = { agencyId: 'A1', roles: ['admin'], canVerify: true };
const LEASE_LIVE = ['active', 'ending_soon'];

interface LeaseRow {
  id: string; listingId: string; customerId: string; dealId: string | null;
  startDate: Date; termMonths: number; endDate: Date; rentUsd: number; depositUsd: number;
  renewedFromLeaseId: string | null; status: string;
}
interface DealRow { id: string; listingId: string; customerId: string; state: string; }

function makeWorld() {
  const listings: Record<string, { id: string; agencyId: string; status: string }> = {
    L1: { id: 'L1', agencyId: 'A1', status: 'rented' },
  };
  const leases: LeaseRow[] = [];
  const deals: DealRow[] = [];
  const users = { tenant: { id: 'tenant', phone: '+2526001', locale: 'so' }, owner: { id: 'owner-u', phone: '+2526005', locale: 'en' } };
  const matchesIn = (v: string, f?: { in: string[] }) => !f || f.in.includes(v);

  const prisma = {
    lease: {
      findFirst: async ({ where }: { where: { id: string; listing?: { agencyId: string } } }) => {
        const l = leases.find((x) => x.id === where.id);
        if (!l) return null;
        if (where.listing && listings[l.listingId].agencyId !== where.listing.agencyId) return null;
        return { ...l, customer: users.tenant, listing: { id: l.listingId, owner: { user: users.owner } } };
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const l = leases.find((x) => x.id === where.id);
        return l ? { ...l } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<LeaseRow> }) => {
        const l = leases.find((x) => x.id === where.id)!;
        Object.assign(l, data);
        return { ...l };
      },
      create: async ({ data }: { data: Partial<LeaseRow> }) => {
        const l = { id: `lease-${leases.length + 1}`, ...(data as LeaseRow) };
        leases.push(l);
        return { ...l };
      },
      count: async ({ where }: { where: Record<string, any> }) =>
        leases.filter((l) => {
          if (!matchesIn(l.status, where.status)) return false;
          if (where.customerId && l.customerId !== where.customerId) return false;
          return true;
        }).length,
    },
    deal: {
      findMany: async ({ where }: { where: { customerId: string; state: { in: string[] } } }) =>
        deals.filter((d) => d.customerId === where.customerId && matchesIn(d.state, where.state)),
      findUnique: async ({ where }: { where: { id: string } }) => {
        const d = deals.find((x) => x.id === where.id);
        return d ? { ...d } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<DealRow> }) => {
        const d = deals.find((x) => x.id === where.id)!;
        Object.assign(d, data);
        return { ...d };
      },
      count: async ({ where }: { where: { listingId: string; state: { in: string[] } } }) =>
        deals.filter((d) => d.listingId === where.listingId && matchesIn(d.state, where.state)).length,
    },
    listing: {
      update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        listings[where.id].status = data.status;
        return listings[where.id];
      },
    },
    dealEvent: { create: async () => ({}) },
    user: { update: async () => ({}) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };

  const storageStub = { presignGet: async () => 'x' } as unknown as StorageService;
  const auditStub = { log: async () => undefined } as unknown as AuditService;
  const notifications = { notify: async () => ({ sent: true }) } as unknown as NotificationsService;
  const listingsService = new ListingsService(prisma as unknown as PrismaService, storageStub, auditStub, notifications);
  const dealState = new DealStateService(prisma as unknown as PrismaService, listingsService, notifications, auditStub);
  const account = new AccountService(prisma as unknown as PrismaService, dealState);
  return { dealState, account, leases, deals, listings, prisma };
}

const addLease = (w: ReturnType<typeof makeWorld>, o: Partial<LeaseRow>): LeaseRow => {
  const l: LeaseRow = {
    id: `lease-${w.leases.length + 1}`, listingId: 'L1', customerId: 'tenant', dealId: 'deal-0',
    startDate: new Date('2026-08-01'), termMonths: 12, endDate: new Date('2027-08-01'),
    rentUsd: 300, depositUsd: 300, renewedFromLeaseId: null, status: 'ending_soon', ...o,
  };
  w.leases.push(l);
  return l;
};

describe('phase 8 — end-of-lease human actions (§16)', () => {
  it('1. renew creates a NEW linked lease, keeps rented, and does not edit the old row’s terms', async () => {
    const w = makeWorld();
    const old = addLease(w, { status: 'ending_soon', endDate: new Date('2027-08-01'), rentUsd: 300 });
    const snapshot = { ...old };
    const created = await w.dealState.renewLease(CTX, 'agent', old.id, { termMonths: 12, newRentUsd: 350 });

    expect(created.renewedFromLeaseId).toBe(old.id);
    expect(created.status).toBe('active');
    expect(created.dealId).toBeNull(); // a renewal has no originating deal
    expect(Number(created.rentUsd)).toBe(350);
    expect(created.startDate).toEqual(snapshot.endDate); // continues, no gap
    expect(w.listings.L1.status).toBe('rented'); // never leaves rented
    // old row's TERMS are untouched (history preserved); only status flips to renewed (§16)
    const oldAfter = w.leases.find((l) => l.id === old.id)!;
    expect(oldAfter.termMonths).toBe(snapshot.termMonths);
    expect(Number(oldAfter.rentUsd)).toBe(Number(snapshot.rentUsd));
    expect(oldAfter.endDate).toEqual(snapshot.endDate);
    expect(oldAfter.renewedFromLeaseId).toBeNull();
    expect(oldAfter.status).toBe('renewed');
    expect(w.leases.length).toBe(2); // a new row, not an edit
  });

  it('2. move-out sets vacated and returns the listing to available', async () => {
    const w = makeWorld();
    const lease = addLease(w, { status: 'active' });
    const updated = await w.dealState.endLease(CTX, 'agent', lease.id, { result: 'vacated' });
    expect(updated.status).toBe('vacated');
    expect(w.listings.L1.status).toBe('available'); // derived release
  });

  it('3. renewing an ending_soon lease clears the grace window (no lease stays ending_soon)', async () => {
    const w = makeWorld();
    const old = addLease(w, { status: 'ending_soon', endDate: new Date('2026-08-20') }); // past-due
    await w.dealState.renewLease(CTX, 'agent', old.id, { termMonths: 12 });
    // the grace-window query is status='ending_soon'; nothing matches now
    const stillGrace = w.leases.filter((l) => l.status === 'ending_soon');
    expect(stillGrace).toHaveLength(0);
    expect(w.leases.find((l) => l.id === old.id)!.status).toBe('renewed');
  });
});

describe('phase 8 — leave-platform (§16 / rule 8)', () => {
  it('4. blocked while a live lease exists; allowed once none', async () => {
    const w = makeWorld();
    const lease = addLease(w, { status: 'active', customerId: 'tenant' });
    await expect(w.account.leave('tenant')).rejects.toBeInstanceOf(ConflictException);
    // end the tenancy, then leaving is allowed
    await w.dealState.endLease(CTX, 'agent', lease.id, { result: 'vacated' });
    const res = await w.account.leave('tenant');
    expect(res).toEqual({ ok: true });
  });

  it('4b. leaving withdraws the user’s open requests', async () => {
    const w = makeWorld();
    w.deals.push({ id: 'd-open', listingId: 'L1', customerId: 'tenant', state: 'requested' });
    // no live lease
    await w.account.leave('tenant');
    expect(w.deals.find((d) => d.id === 'd-open')!.state).toBe('withdrawn');
  });
});

describe('phase 8 — admin oversight is allowlist-only (rule 15)', () => {
  it('5/6. a non-allowlisted, non-flag user is refused by the platform-admin guard', async () => {
    const prisma = {
      user: { findUnique: async () => ({ isPlatformAdmin: false, email: 'nobody@example.com' }) },
    } as unknown as PrismaService;
    const config = { get: () => 'admin@guri.test' } as unknown as ConfigService; // allowlist
    const guard = new PlatformAdminGuard(prisma, config);
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'nobody' } }) }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);

    // an allowlisted email passes
    const prisma2 = {
      user: { findUnique: async () => ({ isPlatformAdmin: false, email: 'admin@guri.test' }) },
    } as unknown as PrismaService;
    const guard2 = new PlatformAdminGuard(prisma2, config);
    await expect(guard2.canActivate(ctx)).resolves.toBe(true);
  });
});
