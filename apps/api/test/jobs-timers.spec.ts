import { describe, expect, it } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service';
import { DealStateService } from '../src/deals/deal-state.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ListingsService } from '../src/listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { StorageService } from '../src/storage/storage.service';
import type { AuditService } from '../src/audit/audit.service';
import type { SmsPort } from '../src/notifications/sms.port';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = new Date('2026-09-01T12:00:00Z');
const RESERVING = ['viewing_scheduled', 'awaiting_docs', 'docs_in_review', 'approved'];
const LEASE_LIVE = ['active', 'ending_soon'];

interface DealRow {
  id: string; listingId: string; customerId: string; agentId: string | null;
  state: string; viewingAt: Date | null; outcomeReason: string | null;
  createdAt: Date; updatedAt: Date;
}
interface LeaseRow {
  id: string; listingId: string; customerId: string; status: string; endDate: Date;
}
interface DocRow { id: string; dealId: string; fileKey: string; createdAt: Date; }
interface NotifRow { userId: string; template: string; dedupeKey: string | null; }

function makeWorld() {
  const users: Record<string, { id: string; phone: string | null; locale: string; name: string }> = {
    tenant: { id: 'tenant', phone: '+252600000001', locale: 'so', name: 'Liban' },
    other: { id: 'other', phone: '+252600000002', locale: 'en', name: 'Khadra' },
    agent: { id: 'agent', phone: '+252600000003', locale: 'so', name: 'Faadumo' },
    verifier: { id: 'verifier', phone: '+252600000004', locale: 'en', name: 'Sagal' },
    owner: { id: 'owner-user', phone: '+252600000005', locale: 'so', name: 'Axmed' },
  };
  const listings: Record<string, { id: string; agencyId: string; ownerId: string; status: string }> = {
    L1: { id: 'L1', agencyId: 'A1', ownerId: 'owner-1', status: 'available' },
  };
  const deals: DealRow[] = [];
  const leases: LeaseRow[] = [];
  const docs: DocRow[] = [];
  const notifs: NotifRow[] = [];
  const members = [
    { userId: 'agent', agencyId: 'A1', active: true, canVerify: false, user: users.agent },
    { userId: 'verifier', agencyId: 'A1', active: true, canVerify: true, user: users.verifier },
  ];
  const deleted: string[] = [];
  const smsSent: string[] = [];
  const matchesIn = (v: string, f?: { in: string[] }) => !f || f.in.includes(v);
  const cmp = (v: Date, f?: { lt?: Date; lte?: Date; gte?: Date; gt?: Date }) =>
    !f || ((f.lt === undefined || v < f.lt) && (f.lte === undefined || v <= f.lte) &&
           (f.gte === undefined || v >= f.gte) && (f.gt === undefined || v > f.gt));

  const hydrateDeal = (d: DealRow) => ({
    ...d,
    customer: users[d.customerId] ?? null,
    agent: d.agentId ? users[d.agentId] : null,
    listing: {
      id: d.listingId,
      agencyId: listings[d.listingId].agencyId,
      agency: { name: 'Karan Realty', phone: '+252614000000' },
    },
  });
  const hydrateLease = (l: LeaseRow) => ({
    ...l,
    customer: users[l.customerId],
    listing: {
      agencyId: listings[l.listingId].agencyId,
      owner: { user: users.owner },
    },
  });

  const prisma = {
    deal: {
      findMany: async ({ where }: { where: Record<string, any> }) =>
        deals
          .filter((d) => {
            if (where.state && !matchesIn(d.state, typeof where.state === 'string' ? { in: [where.state] } : where.state)) {
              if (typeof where.state === 'string' && d.state !== where.state) return false;
            }
            if (typeof where.state === 'string' && d.state !== where.state) return false;
            if (where.agentId?.not === null && d.agentId === null) return false;
            if (where.viewingAt && !cmp(d.viewingAt!, where.viewingAt)) return false;
            if (where.createdAt && !cmp(d.createdAt, where.createdAt)) return false;
            if (where.updatedAt && !cmp(d.updatedAt, where.updatedAt)) return false;
            return true;
          })
          .map(hydrateDeal),
      findUnique: async ({ where }: { where: { id: string } }) => {
        const d = deals.find((x) => x.id === where.id);
        return d ? { ...d } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<DealRow> }) => {
        const d = deals.find((x) => x.id === where.id)!;
        Object.assign(d, data, { updatedAt: NOW });
        return { ...d };
      },
      count: async ({ where }: { where: { listingId: string; state: { in: string[] } } }) =>
        deals.filter((d) => d.listingId === where.listingId && matchesIn(d.state, where.state)).length,
    },
    lease: {
      findMany: async ({ where }: { where: Record<string, any> }) =>
        leases
          .filter((l) => l.status === where.status && cmp(l.endDate, where.endDate))
          .map(hydrateLease),
      findUnique: async ({ where }: { where: { id: string } }) => {
        const l = leases.find((x) => x.id === where.id);
        return l ? { ...l } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<LeaseRow> }) => {
        const l = leases.find((x) => x.id === where.id)!;
        Object.assign(l, data);
        return { ...l };
      },
      count: async ({ where }: { where: { listingId: string; status: { in: string[] } } }) =>
        leases.filter((l) => l.listingId === where.listingId && matchesIn(l.status, where.status)).length,
    },
    listing: {
      update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        listings[where.id].status = data.status;
        return listings[where.id];
      },
    },
    dealEvent: { create: async () => ({}) },
    agencyMember: {
      findMany: async ({ where }: { where: { agencyId: string; active: boolean; canVerify?: boolean } }) =>
        members.filter(
          (m) => m.agencyId === where.agencyId && m.active === where.active &&
            (where.canVerify === undefined || m.canVerify === where.canVerify),
        ),
    },
    customerDocument: {
      findMany: async ({ where }: { where: { createdAt: { lt: Date }; deal: { state: { in: string[] } } } }) =>
        docs
          .filter((doc) => cmp(doc.createdAt, where.createdAt) &&
            matchesIn(deals.find((d) => d.id === doc.dealId)!.state, where.deal.state))
          .map((d) => ({ id: d.id, fileKey: d.fileKey })),
      delete: async ({ where }: { where: { id: string } }) => {
        const i = docs.findIndex((d) => d.id === where.id);
        deleted.push(docs[i].id);
        docs.splice(i, 1);
        return {};
      },
    },
    notification: {
      findUnique: async ({ where }: { where: { dedupeKey: string } }) =>
        notifs.find((n) => n.dedupeKey === where.dedupeKey) ?? null,
      create: async ({ data }: { data: NotifRow }) => {
        notifs.push({ userId: data.userId, template: data.template, dedupeKey: data.dedupeKey ?? null });
        return {};
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };

  const storageStub = {
    presignGet: async () => 'x', putObject: async () => undefined,
    deleteObject: async () => undefined, processPhotoToWebp: async (b: Buffer) => b,
  } as unknown as StorageService;
  const auditStub = { log: async () => undefined } as unknown as AuditService;
  const smsStub: SmsPort = { send: async (_p, m) => { smsSent.push(m); } };

  const notifications = new NotificationsService(prisma as unknown as PrismaService, smsStub);
  const listingsService = new ListingsService(prisma as unknown as PrismaService, storageStub, auditStub, notifications);
  const dealState = new DealStateService(prisma as unknown as PrismaService, listingsService, notifications, auditStub);
  // Intake expiry is covered in its own spec; here it's a no-op stub.
  const intakesStub = { expireStaleSubmitted: async () => 0 } as unknown as import('../src/intakes/intakes.service').IntakesService;
  const jobs = new JobsService(prisma as unknown as PrismaService, dealState, notifications, storageStub, intakesStub);

  return { jobs, deals, leases, docs, notifs, deleted, listings, users, prisma };
}

const mkDeal = (w: ReturnType<typeof makeWorld>, o: Partial<DealRow>): DealRow => {
  const d: DealRow = {
    id: `d${w.deals.length + 1}`, listingId: 'L1', customerId: 'tenant', agentId: null,
    state: 'requested', viewingAt: null, outcomeReason: null, createdAt: NOW, updatedAt: NOW, ...o,
  };
  w.deals.push(d);
  return d;
};

describe('phase 7 — background timers (§4/§16, rule 7)', () => {
  it('1. a requested deal older than 14 days expires; one at 13 days does not', async () => {
    const w = makeWorld();
    const old = mkDeal(w, { createdAt: new Date(NOW.getTime() - 15 * DAY) });
    const recent = mkDeal(w, { createdAt: new Date(NOW.getTime() - 13 * DAY) });
    await w.jobs.expireStaleRequests(NOW);
    expect(w.deals.find((d) => d.id === old.id)!.state).toBe('expired');
    expect(w.deals.find((d) => d.id === recent.id)!.state).toBe('requested');
    expect(w.notifs.some((n) => n.template === 'deal_expired' && n.userId === 'tenant')).toBe(true);
  });

  it('2. a lease crossing the 30-day mark becomes ending_soon and notifies tenant, agency, and owner', async () => {
    const w = makeWorld();
    w.listings.L1.status = 'rented';
    w.leases.push({ id: 'lease-1', listingId: 'L1', customerId: 'tenant', status: 'active', endDate: new Date(NOW.getTime() + 20 * DAY) });
    await w.jobs.markLeasesEndingSoon(NOW);
    expect(w.leases[0].status).toBe('ending_soon');
    expect(w.listings.L1.status).toBe('rented'); // stays rented (ending_soon is live)
    const ended = w.notifs.filter((n) => n.template === 'lease_ending_soon').map((n) => n.userId);
    expect(ended).toContain('tenant');
    expect(ended).toContain('owner-user');
    expect(ended).toContain('agent'); // an agency member
  });

  it('3. a past-due lease STAYS ending_soon, listing STAYS rented, nudge queued — no timer ever ends a tenancy', async () => {
    const w = makeWorld();
    w.listings.L1.status = 'rented';
    w.leases.push({ id: 'lease-1', listingId: 'L1', customerId: 'tenant', status: 'ending_soon', endDate: new Date(NOW.getTime() - 5 * DAY) });
    await w.jobs.runTick(NOW);
    expect(w.leases[0].status).toBe('ending_soon'); // never ended/vacated
    expect(w.listings.L1.status).toBe('rented');
    expect(w.notifs.some((n) => n.template === 'lease_grace_nudge')).toBe(true);
    // the cardinal rule: no lease reached a terminal state from a timer
    expect(w.leases.every((l) => l.status !== 'ended' && l.status !== 'vacated')).toBe(true);
  });

  it('4. a stuck viewing_scheduled deal expires and releases the listing, other queued deals intact', async () => {
    const w = makeWorld();
    w.listings.L1.status = 'reserved';
    const stuck = mkDeal(w, { state: 'viewing_scheduled', agentId: 'agent', viewingAt: new Date(NOW.getTime() - 8 * DAY) });
    const queued = mkDeal(w, { state: 'requested', customerId: 'other' });
    await w.jobs.expireStuckViewings(NOW);
    expect(w.deals.find((d) => d.id === stuck.id)!.state).toBe('expired');
    expect(w.deals.find((d) => d.id === queued.id)!.state).toBe('requested'); // queue intact
    expect(w.listings.L1.status).toBe('available'); // released, derived
  });

  it('5. re-running the tick twice sends no duplicate notifications (idempotency)', async () => {
    const w = makeWorld();
    w.listings.L1.status = 'rented';
    mkDeal(w, { createdAt: new Date(NOW.getTime() - 20 * DAY) }); // stale request
    w.leases.push({ id: 'lease-1', listingId: 'L1', customerId: 'tenant', status: 'active', endDate: new Date(NOW.getTime() + 10 * DAY) });
    await w.jobs.runTick(NOW);
    const after1 = w.notifs.length;
    await w.jobs.runTick(NOW);
    expect(w.notifs.length).toBe(after1); // dedupe held; nothing re-sent
  });

  it('6. customer documents from an expired deal are purged after 90 days; closed-deal docs are NOT', async () => {
    const w = makeWorld();
    const expiredDeal = mkDeal(w, { state: 'expired' });
    const closedDeal = mkDeal(w, { state: 'closed' });
    w.docs.push({ id: 'doc-expired', dealId: expiredDeal.id, fileKey: 'customer-docs/x.webp', createdAt: new Date(NOW.getTime() - 100 * DAY) });
    w.docs.push({ id: 'doc-closed', dealId: closedDeal.id, fileKey: 'customer-docs/y.webp', createdAt: new Date(NOW.getTime() - 100 * DAY) });
    const purged = await w.jobs.purgeExpiredDocuments(NOW);
    expect(purged).toBe(1);
    expect(w.deleted).toEqual(['doc-expired']);
    expect(w.docs.some((d) => d.id === 'doc-closed')).toBe(true); // kept
  });
});
