import { describe, expect, it } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { AgencyGuard } from '../src/auth/agency.guard';
import { OwnerGuard } from '../src/owner/owner.guard';
import { StaffService } from '../src/staff/staff.service';
import { OwnersService } from '../src/owners/owners.service';
import { AdminService } from '../src/admin/admin.service';
import { ListingsService } from '../src/listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { AuditService } from '../src/audit/audit.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { StorageService } from '../src/storage/storage.service';
import type { ConfigService } from '@nestjs/config';

// Phase 8.5 (§17): deactivate, never destroy. Every revocation is enforced at
// the GUARD (takes effect on the next request), never a hard delete, and is
// written to audit_log.

interface AnyRow {
  [k: string]: any;
}
const auditSink = () => {
  const rows: { action: string; objectType: string; objectId: string }[] = [];
  const audit = {
    log: async (e: AnyRow) => {
      rows.push({ action: e.action, objectType: e.objectType, objectId: e.objectId });
    },
  } as unknown as AuditService;
  return { rows, audit };
};

// Build the ExecutionContext the guards read.
function ctxFor(userId: string, headers: Record<string, string> = {}): ExecutionContext {
  const req: AnyRow = { user: { sub: userId }, headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => function h() {},
    getClass: () => class C {},
  } as unknown as ExecutionContext;
}

// ─── Test 1 + 3b: the guard rejects a deactivated worker / suspended-agency staff ─
describe('AgencyGuard — revocation takes effect at the API on the next request', () => {
  // members: rows the guard's findMany({where:{userId,active:true}}) reads.
  function prismaWith(members: AnyRow[]): PrismaService {
    return {
      agencyMember: {
        findMany: async ({ where }: AnyRow) =>
          members
            .filter(
              (m) =>
                m.userId === where.userId && (where.active === undefined || m.active === where.active),
            )
            .map((m) => ({
              userId: m.userId,
              agencyId: m.agencyId,
              role: m.role,
              active: m.active,
              canVerify: !!m.canVerify,
              agency: { status: m.agencyStatus },
            })),
      },
    } as unknown as PrismaService;
  }
  const guard = (members: AnyRow[]) => new AgencyGuard(prismaWith(members), new Reflector());

  it('(1) a DEACTIVATED membership is 403 on the next request', async () => {
    const g = guard([{ userId: 'u1', agencyId: 'A', role: 'agent', active: false, agencyStatus: 'active' }]);
    await expect(g.canActivate(ctxFor('u1'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('(3b) a member of a SUSPENDED agency is 403 on agency routes', async () => {
    const g = guard([{ userId: 'u2', agencyId: 'A', role: 'admin', active: true, agencyStatus: 'suspended' }]);
    await expect(g.canActivate(ctxFor('u2'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('(control) an active member of an active agency passes', async () => {
    const g = guard([{ userId: 'u3', agencyId: 'A', role: 'admin', active: true, agencyStatus: 'active' }]);
    await expect(g.canActivate(ctxFor('u3'))).resolves.toBe(true);
  });
});

// ─── Test 2: deactivating the last active admin is blocked ────────────────────
describe('StaffService — last-admin guard-rail', () => {
  function makeService(opts: { targetRows: AnyRow[]; otherActiveAdmins: AnyRow[] }) {
    const { rows, audit } = auditSink();
    const updates: AnyRow[] = [];
    const prisma = {
      agencyMember: {
        findMany: async ({ where }: AnyRow) => {
          if (where.role === 'admin' && where.active === true && where.userId?.not) {
            return opts.otherActiveAdmins;
          }
          return opts.targetRows; // rows for {agencyId, userId}
        },
        findFirst: async () => null,
        updateMany: async (a: AnyRow) => {
          updates.push(a);
          return { count: 1 };
        },
      },
      deal: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    } as unknown as PrismaService;
    const notifications = { recordInApp: async () => undefined } as unknown as NotificationsService;
    const svc = new StaffService(prisma, audit, notifications);
    // list() is called at the end; stub it out so the test stays focused.
    (svc as AnyRow).list = async () => [];
    return { svc, updates, audit: rows };
  }

  it('(2) blocks deactivating the last active admin with a clear error', async () => {
    const { svc, updates } = makeService({
      targetRows: [{ role: 'admin', active: true }],
      otherActiveAdmins: [], // nobody else → this is the last admin
    });
    await expect(
      svc.patch({ agencyId: 'A', roles: ['admin'], canVerify: true }, 'actor', 'admin1', {
        active: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updates).toHaveLength(0); // nothing was flipped
  });

  it('allows deactivating an admin when another active admin remains', async () => {
    const { svc, updates, audit } = makeService({
      targetRows: [{ role: 'admin', active: true }],
      otherActiveAdmins: [{ userId: 'admin2' }],
    });
    await svc.patch({ agencyId: 'A', roles: ['admin'], canVerify: true }, 'actor', 'admin1', {
      active: false,
    });
    expect(updates[0].data.active).toBe(false);
    expect(audit.some((a) => a.action === 'staff.deactivated')).toBe(true);
  });
});

// ─── Test 4 + 7(staff): reassign live deals; audit the deactivation ───────────
describe('StaffService — a deactivated agent’s live deals are reassigned, not orphaned', () => {
  it('(4)(7) reassigns the deals to another active member and audits it', async () => {
    const { rows, audit } = auditSink();
    const dealUpdates: AnyRow[] = [];
    const notified: string[] = [];
    const prisma = {
      agencyMember: {
        findMany: async ({ where }: AnyRow) => {
          if (where.role === 'admin' && where.active === true && where.userId?.not) return []; // n/a: target is an agent
          return [{ role: 'agent', active: true }]; // target's rows
        },
        findFirst: async ({ where }: AnyRow) =>
          where.role === 'agent' ? { userId: 'agent2' } : { userId: 'admin1' },
        updateMany: async () => ({ count: 1 }),
      },
      deal: {
        findMany: async () => [{ id: 'd1' }, { id: 'd2' }], // this agent's live deals
        updateMany: async (a: AnyRow) => {
          dealUpdates.push(a);
          return { count: 2 };
        },
      },
    } as unknown as PrismaService;
    const notifications = {
      recordInApp: async (i: AnyRow) => {
        notified.push(i.userId);
      },
    } as unknown as NotificationsService;
    const svc = new StaffService(prisma, audit, notifications);
    (svc as AnyRow).list = async () => [];

    await svc.patch({ agencyId: 'A', roles: ['admin'], canVerify: true }, 'actor', 'agent1', {
      active: false,
    });

    // deals moved to another ACTIVE agent — never null, never the departing user
    expect(dealUpdates[0].data.agentId).toBe('agent2');
    expect(dealUpdates[0].where.id.in).toEqual(['d1', 'd2']);
    expect(notified).toContain('agent2');
    // both the reassignment and the deactivation are on the audit trail
    expect(rows.some((a) => a.action === 'deals.reassigned')).toBe(true);
    expect(rows.some((a) => a.action === 'staff.deactivated')).toBe(true);
  });
});

// ─── Test 3a: suspended agency's listings vanish from public browse ───────────
describe('ListingsService.publicList — suspended agencies drop out of browse (§17)', () => {
  function makeService(listings: AnyRow[]) {
    const matches = (l: AnyRow, where: AnyRow) =>
      l.publishedAt != null &&
      (where.status?.in ?? ['available', 'reserved']).includes(l.status) &&
      l.agencyStatus === (where.agency?.status ?? 'active');
    const prisma = {
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
      listing: {
        count: async ({ where }: AnyRow) => listings.filter((l) => matches(l, where)).length,
        findMany: async ({ where }: AnyRow) =>
          listings.filter((l) => matches(l, where)).map((l) => ({ ...l, agency: { name: 'Agency A' } })),
        aggregate: async () => ({ _max: { rentUsd: 500, bedrooms: 3 } }),
      },
    } as unknown as PrismaService;
    const storage = { presignGet: async () => 'https://x' } as unknown as StorageService;
    const audit = { log: async () => undefined } as unknown as AuditService;
    const notifications = { notify: async () => ({ sent: false }) } as unknown as NotificationsService;
    return new ListingsService(prisma, storage, audit, notifications);
  }

  it('(3a) an active agency’s listing shows; suspending its agency hides it', async () => {
    const active = makeService([
      { id: 'L1', status: 'available', publishedAt: new Date(), agencyStatus: 'active', photos: [], rentUsd: 300, district: 'Karan', type: 'house', bedrooms: 2, bathrooms: 1, neighborhood: null },
    ]);
    const shown = await active.publicList({ page: 1 } as AnyRow);
    expect(shown.total).toBe(1);

    const suspended = makeService([
      { id: 'L1', status: 'available', publishedAt: new Date(), agencyStatus: 'suspended', photos: [], rentUsd: 300, district: 'Karan', type: 'house', bedrooms: 2, bathrooms: 1, neighborhood: null },
    ]);
    const hidden = await suspended.publicList({ page: 1 } as AnyRow);
    expect(hidden.total).toBe(0);
    expect(hidden.items).toHaveLength(0);
  });
});

// ─── Test 3c: leases stay readable — owner access isn't gated by agency status ─
describe('OwnerGuard — a suspended agency’s owner can still reach their (readable) leases', () => {
  it('(3c) OwnerGuard passes for an owner regardless of agency status', async () => {
    const prisma = {
      owner: { findMany: async () => [{ id: 'own1' }] }, // owner rows only — no agency-status check
    } as unknown as PrismaService;
    const guard = new OwnerGuard(prisma);
    await expect(guard.canActivate(ctxFor('owner-user'))).resolves.toBe(true);
  });
});

// ─── Test 5 + 7(owner): owner live-lease guard; audit ─────────────────────────
describe('OwnersService.setActive — live-lease guard + audit (§17)', () => {
  function makeService(liveLeases: number) {
    const { rows, audit } = auditSink();
    const userUpdates: AnyRow[] = [];
    const prisma = {
      owner: {
        findFirst: async () => ({ id: 'own1', userId: 'owner-user', agencyId: 'A' }),
        findFirstOrThrow: async () => ({
          id: 'own1',
          inviteStatus: 'claimed',
          createdAt: new Date(),
          user: { name: 'Axmed', phone: '+2526', active: false },
        }),
      },
      lease: { count: async () => liveLeases },
      user: {
        update: async (a: AnyRow) => {
          userUpdates.push(a);
          return {};
        },
      },
    } as unknown as PrismaService;
    const notifications = {} as unknown as NotificationsService;
    const config = { get: () => 'http://x' } as unknown as ConfigService;
    const svc = new OwnersService(prisma, notifications, audit, config);
    return { svc, userUpdates, audit: rows };
  }

  it('(5) refuses to deactivate an owner with a live lease', async () => {
    const { svc, userUpdates } = makeService(1);
    await expect(
      svc.setActive({ agencyId: 'A', roles: ['agent'], canVerify: false }, 'actor', 'own1', false),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(userUpdates).toHaveLength(0); // the user row was never touched
  });

  it('(5)(7) deactivates an owner with no live lease and audits it', async () => {
    const { svc, userUpdates, audit } = makeService(0);
    await svc.setActive({ agencyId: 'A', roles: ['agent'], canVerify: false }, 'actor', 'own1', false);
    expect(userUpdates[0].data.active).toBe(false); // flip, not delete
    expect(userUpdates[0].data.deactivatedAt).toBeInstanceOf(Date);
    expect(audit.some((a) => a.action === 'owner.deactivated' && a.objectType === 'owner')).toBe(true);
  });
});

// ─── Test 7(agency): suspend is audited ───────────────────────────────────────
describe('AdminService.patchAgency — suspension is audited, reversible (§17)', () => {
  it('(7) writes an agency.suspended audit row and can reactivate', async () => {
    const { rows, audit } = auditSink();
    const prisma = {
      agency: {
        findUnique: async () => ({ id: 'A', status: 'active' }),
        update: async ({ data }: AnyRow) => ({ id: 'A', status: data.status }),
      },
    } as unknown as PrismaService;
    const svc = new AdminService(prisma, audit);
    await svc.patchAgency('actor', 'A', { status: 'suspended' });
    await svc.patchAgency('actor', 'A', { status: 'active' });
    expect(rows.map((r) => r.action)).toEqual(['agency.suspended', 'agency.active']);
  });
});

// ─── Test 6: no hard-DELETE endpoint exists anywhere ──────────────────────────
describe('§17 invariant — no hard-DELETE route for history-bearing records', () => {
  it('(6) no controller declares an @Delete route', () => {
    const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
      });
    const controllers = walk(srcDir).filter((p) => /@Controller\(/.test(readFileSync(p, 'utf8')));
    const withDelete = controllers.filter((p) => /@Delete\(/.test(readFileSync(p, 'utf8')));
    expect(withDelete).toEqual([]);
  });
});
