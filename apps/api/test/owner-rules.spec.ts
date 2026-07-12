import { describe, expect, it } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { OwnerService } from '../src/owner/owner.service';
import { AgencyGuard } from '../src/auth/agency.guard';
import { ClerkSyncService } from '../src/webhooks/clerk-sync.service';
import { MeController } from '../src/auth/me.controller';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { StorageService } from '../src/storage/storage.service';
import type { AuthenticatedRequest } from '../src/auth/clerk-auth.guard';

const OWNER_A = { ownerIds: ['owner-a'] };
const OWNER_B = { ownerIds: ['owner-b'] };

const storageStub = { presignGet: async () => 'https://x' } as unknown as StorageService;

// Two owners, one listing each; payments recorded by the agency (phase 5).
function makeOwnerWorld() {
  const listings = [
    { id: 'listing-a', ownerId: 'owner-a', district: 'Hodan', neighborhood: null, type: 'house', bedrooms: 2, bathrooms: 1, rentUsd: 450, depositUsd: 450, status: 'rented', publishedAt: new Date(), photos: [], agency: { name: 'A', phone: '+1' } },
    { id: 'listing-b', ownerId: 'owner-b', district: 'Karan', neighborhood: null, type: 'house', bedrooms: 3, bathrooms: 2, rentUsd: 600, depositUsd: 600, status: 'rented', publishedAt: new Date(), photos: [], agency: { name: 'B', phone: '+2' } },
  ];
  const leases = [
    { id: 'lease-a', listingId: 'listing-a', status: 'active', startDate: new Date('2026-08-01'), endDate: new Date('2027-08-01'), termMonths: 12, renewedFromLeaseId: null, customer: { name: 'Liban' } },
    { id: 'lease-b', listingId: 'listing-b', status: 'active', startDate: new Date('2026-06-01'), endDate: new Date('2027-06-01'), termMonths: 12, renewedFromLeaseId: null, customer: { name: 'Sagal' } },
  ];
  const payments = [
    { id: 'p1', leaseId: 'lease-a', type: 'deposit', amountUsd: 450, paidOn: new Date('2026-08-01'), note: null },
    { id: 'p2', leaseId: 'lease-a', type: 'monthly_rent', amountUsd: 450, paidOn: new Date('2026-08-01'), note: null },
    { id: 'p3', leaseId: 'lease-b', type: 'monthly_rent', amountUsd: 600, paidOn: new Date('2026-08-05'), note: null },
  ];
  const leaseListing = (leaseId: string) => listings.find((l) => l.id === leases.find((x) => x.id === leaseId)!.listingId)!;
  const paymentMatches = (p: (typeof payments)[number], where: Record<string, unknown>) => {
    const leaseWhere = where.lease as { listing: { ownerId: { in: string[] }; id?: string } };
    const listing = leaseListing(p.leaseId);
    if (!leaseWhere.listing.ownerId.in.includes(listing.ownerId)) return false;
    if (leaseWhere.listing.id && listing.id !== leaseWhere.listing.id) return false;
    const paidOn = where.paidOn as { gte?: Date; lt?: Date } | undefined;
    if (paidOn?.gte && p.paidOn < paidOn.gte) return false;
    if (paidOn?.lt && p.paidOn >= paidOn.lt) return false;
    return true;
  };

  const prisma = {
    listing: {
      count: async ({ where }: { where: { ownerId: { in: string[] } } }) =>
        listings.filter((l) => where.ownerId.in.includes(l.ownerId)).length,
      findMany: async ({ where }: { where: { ownerId: { in: string[] } } }) =>
        listings
          .filter((l) => where.ownerId.in.includes(l.ownerId))
          .map((l) => ({ ...l, leases: leases.filter((x) => x.listingId === l.id) })),
      findFirst: async ({ where }: { where: { id: string; ownerId: { in: string[] } } }) => {
        const l = listings.find(
          (x) => x.id === where.id && where.ownerId.in.includes(x.ownerId),
        );
        return l
          ? {
              ...l,
              leases: leases
                .filter((x) => x.listingId === l.id)
                .map((x) => ({ ...x, payments: payments.filter((p) => p.leaseId === x.id) })),
            }
          : null;
      },
    },
    lease: {
      count: async ({ where }: { where: { listing: { ownerId: { in: string[] } } } }) =>
        leases.filter((x) =>
          where.listing.ownerId.in.includes(leaseListing(x.id).ownerId),
        ).length,
    },
    payment: {
      aggregate: async ({ where }: { where: Record<string, unknown> }) => ({
        _sum: {
          amountUsd: payments
            .filter((p) => paymentMatches(p, where))
            .reduce((s, p) => s + p.amountUsd, 0),
        },
      }),
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        payments
          .filter((p) => paymentMatches(p, where))
          .map((p) => ({
            ...p,
            lease: { listing: { id: leaseListing(p.leaseId).id, district: leaseListing(p.leaseId).district, neighborhood: null } },
          })),
    },
    notification: { findMany: async () => [] },
  };
  return new OwnerService(prisma as unknown as PrismaService, storageStub);
}

describe('phase 6 — owner scoping (rule 3)', () => {
  it('1. an owner reads only their own properties, leases and payments', async () => {
    const svc = makeOwnerWorld();
    const mine = await svc.properties(OWNER_A);
    expect(mine.map((p) => p.id)).toEqual(['listing-a']);
    expect(mine[0].currentLease?.tenantName).toBe('Liban');

    // another owner's property id → 404
    await expect(svc.propertyDetail(OWNER_A, 'listing-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // ledger never leaks the other owner's payments
    const ledger = await svc.payments(OWNER_A, {});
    expect(ledger.items.every((i) => i.listing.id === 'listing-a')).toBe(true);
  });

  it('2. an owner (no agency membership) is rejected by the agency guard — all agency/deal/lease writes share it', async () => {
    const prisma = {
      agencyMember: { findMany: async () => [] },
    } as unknown as PrismaService;
    const guard = new AgencyGuard(prisma, new Reflector());
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'owner-user' }, headers: {} }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('4. income totals equal the sum of that owner’s payments, scoped per property', async () => {
    const svc = makeOwnerWorld();
    const all = await svc.payments(OWNER_A, {});
    expect(all.items.reduce((s, i) => s + i.amountUsd, 0)).toBe(900); // 450 + 450, never B's 600
    expect(all.monthlyTotals).toEqual([{ month: '2026-08', totalUsd: 900 }]);

    const perProperty = await svc.payments(OWNER_B, { listingId: 'listing-b' });
    expect(perProperty.items.reduce((s, i) => s + i.amountUsd, 0)).toBe(600);
  });
});

describe('phase 6 — claim flow (rule 15)', () => {
  function makeClaimWorld() {
    const users: Array<{ id: string; clerkUserId: string | null; email: string | null; name: string | null; active: boolean }> = [
      { id: 'u-axmed', clerkUserId: null, email: 'axmed@guri.test', name: 'Axmed Warsame', active: true },
    ];
    const owners: Array<{ id: string; userId: string; inviteStatus: string }> = [
      { id: 'owner-axmed', userId: 'u-axmed', inviteStatus: 'invited' },
    ];
    const prisma = {
      user: {
        findUnique: async ({ where }: { where: { clerkUserId?: string; email?: string } }) =>
          users.find(
            (u) =>
              (where.clerkUserId && u.clerkUserId === where.clerkUserId) ||
              (where.email && u.email === where.email),
          ) ?? null,
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const u = users.find((x) => x.id === where.id)!;
          Object.assign(u, data);
          return u;
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const u = { id: `u-${users.length + 1}`, clerkUserId: null, email: null, name: null, active: true, ...data };
          users.push(u as (typeof users)[number]);
          return u;
        },
        updateMany: async () => ({ count: 0 }),
      },
      owner: {
        updateMany: async ({ where, data }: { where: { userId: string; inviteStatus: string }; data: { inviteStatus: string } }) => {
          const hits = owners.filter(
            (o) => o.userId === where.userId && o.inviteStatus === where.inviteStatus,
          );
          hits.forEach((o) => Object.assign(o, data));
          return { count: hits.length };
        },
      },
    };
    return { sync: new ClerkSyncService(prisma as unknown as PrismaService), users, owners };
  }

  it('3. claiming links the Clerk user by email, sets invite_status, and never duplicates', async () => {
    const w = makeClaimWorld();
    const event = {
      type: 'user.created',
      data: {
        id: 'user_clerk_axmed',
        primary_email_address_id: 'em1',
        email_addresses: [{ id: 'em1', email_address: 'Axmed@guri.test' }],
      },
    };
    await w.sync.processEvent(event);
    expect(w.users).toHaveLength(1); // linked, not duplicated
    expect(w.users[0].clerkUserId).toBe('user_clerk_axmed');
    expect(w.owners[0].inviteStatus).toBe('claimed');

    // second sign-in (user.created replays / user.updated) → still one of each
    await w.sync.processEvent(event);
    await w.sync.processEvent({ ...event, type: 'user.updated' });
    expect(w.users).toHaveLength(1);
    expect(w.owners).toHaveLength(1);
  });

  it('5. a user who is owner AND customer resolves to both roles on ONE account', async () => {
    const prisma = {
      user: {
        findUnique: async () => ({
          id: 'u-axmed',
          phone: '+252677777777',
          name: 'Axmed Warsame',
          email: 'axmed@guri.test',
          locale: 'so',
          isPlatformAdmin: false,
          agencyMemberships: [],
          ownerProfiles: [{ agencyId: 'agency-a' }],
        }),
      },
    } as unknown as PrismaService;
    const config = { get: () => '' } as unknown as ConfigService;
    const me = new MeController(prisma, config);
    const result = await me.me({ user: { sub: 'u-axmed' } } as AuthenticatedRequest);

    expect(result.id).toBe('u-axmed'); // one account
    expect(result.roles.customer).toBe(true); // everyone is a customer (§2)
    expect(result.roles.owner).toBe(true); // and this one is an owner too
    // ≥2 surfaces → the role switcher renders (it needs exactly this shape)
    const surfaces = 1 + (result.roles.owner ? 1 : 0);
    expect(surfaces).toBeGreaterThanOrEqual(2);
  });
});
