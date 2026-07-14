import { describe, expect, it, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IntakesService } from '../src/intakes/intakes.service';
import { AgenciesDirectoryService } from '../src/intakes/agencies-directory.service';
import { ListingsService } from '../src/listings/listings.service';
import { MeController } from '../src/auth/me.controller';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { StorageService } from '../src/storage/storage.service';
import type { AuditService } from '../src/audit/audit.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { ConfigService } from '@nestjs/config';

// ── in-memory world ─────────────────────────────────────────────────────────
// Enough of Prisma to exercise the real IntakesService, ListingsService and the
// /me role rule together. THE LOAD-BEARING assertion (§15/rule 6): nothing from
// an intake is public until an agency converts it and the listing is published.

interface AnyRow { [k: string]: any }
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function makeWorld() {
  const AGENCY_A = uuid(1);
  const AGENCY_B = uuid(2);
  const CUSTOMER = uuid(10); // a plain customer who will become an owner
  const AGENT = uuid(11);

  const agencies: AnyRow[] = [
    { id: AGENCY_A, name: 'Karan Realty', phone: '+252614000000', districts: ['Karan', 'Hodan'], status: 'active' },
    { id: AGENCY_B, name: 'Shabelle Homes', phone: '+252615000000', districts: ['Wadajir'], status: 'active' },
    { id: uuid(3), name: 'Pending Co', phone: '+252616000000', districts: ['Hodan'], status: 'pending' },
  ];
  const users: AnyRow[] = [
    { id: CUSTOMER, name: 'Cali Owner', phone: '+252611111111', locale: 'so', email: 'cali@guri.test', isPlatformAdmin: false },
    { id: AGENT, name: 'Faadumo', phone: '+252612222222', locale: 'so', email: 'faadumo@guri.test', isPlatformAdmin: false },
  ];
  const members: AnyRow[] = [{ userId: AGENT, agencyId: AGENCY_A, active: true, canVerify: true, role: 'admin' }];
  const intakes: AnyRow[] = [];
  const owners: AnyRow[] = [];
  const listings: AnyRow[] = [];
  const notifications: { userId: string; template: string }[] = [];
  const audit: { action: string; objectType: string; objectId: string }[] = [];
  let seq = 100;

  const isPublic = (l: AnyRow) => l.publishedAt != null && ['available', 'reserved'].includes(l.status);
  const matchListing = (l: AnyRow, where: AnyRow) => {
    if (where.id && l.id !== where.id) return false;
    if (where.agencyId && l.agencyId !== where.agencyId) return false;
    if (where.publishedAt?.not === null && l.publishedAt == null) return false;
    if (where.status?.in && !where.status.in.includes(l.status)) return false;
    if (where.district && l.district !== where.district) return false;
    return true;
  };

  const prisma = {
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    agency: {
      findUnique: async ({ where }: AnyRow) => agencies.find((a) => a.id === where.id) ?? null,
      findMany: async ({ where }: AnyRow = { where: {} }) =>
        agencies.filter(
          (a) =>
            (!where?.status || a.status === where.status) &&
            (!where?.districts?.has || a.districts.includes(where.districts.has)),
        ),
    },
    agencyMember: {
      findMany: async ({ where }: AnyRow) =>
        members
          .filter((m) => m.agencyId === where.agencyId && m.active)
          .map((m) => ({ ...m, user: users.find((u) => u.id === m.userId) })),
    },
    user: {
      findUnique: async ({ where, include }: AnyRow) => {
        const u = users.find((x) => x.id === where.id);
        if (!u) return null;
        if (!include) return u;
        return {
          ...u,
          agencyMemberships: members.filter((m) => m.userId === u.id && m.active),
          ownerProfiles: owners.filter((o) => o.userId === u.id),
          intakes: intakes.filter((i) => i.ownerUserId === u.id).slice(0, 1),
        };
      },
    },
    intake: {
      create: async ({ data }: AnyRow) => {
        const row = { id: uuid(seq++), createdAt: new Date(), updatedAt: new Date(), listingId: null, declineReason: null, ...data };
        intakes.push(row);
        return row;
      },
      findUnique: async ({ where, include }: AnyRow) => {
        const i = intakes.find((x) => x.id === where.id);
        if (!i) return null;
        return include?.agency ? { ...i, agency: agencies.find((a) => a.id === i.agencyId) } : i;
      },
      findFirst: async ({ where, include }: AnyRow) => {
        const i = intakes.find((x) => (where.listingId ? x.listingId === where.listingId : true));
        if (!i) return null;
        return include?.ownerUser ? { ...i, ownerUser: users.find((u) => u.id === i.ownerUserId) } : i;
      },
      findMany: async ({ where }: AnyRow = { where: {} }) => {
        let rows = intakes.filter((i) => {
          if (where?.ownerUserId && i.ownerUserId !== where.ownerUserId) return false;
          if (where?.agencyId && i.agencyId !== where.agencyId) return false;
          if (where?.status?.in && !where.status.in.includes(i.status)) return false;
          if (where?.status && typeof where.status === 'string' && i.status !== where.status) return false;
          if (where?.createdAt?.lt && !(i.createdAt < where.createdAt.lt)) return false;
          return true;
        });
        return rows.map((i) => ({
          ...i,
          agency: agencies.find((a) => a.id === i.agencyId),
          ownerUser: users.find((u) => u.id === i.ownerUserId),
        }));
      },
      update: async ({ where, data, include }: AnyRow) => {
        const i = intakes.find((x) => x.id === where.id)!;
        Object.assign(i, data, { updatedAt: new Date() });
        return include?.agency ? { ...i, agency: agencies.find((a) => a.id === i.agencyId) } : i;
      },
    },
    owner: {
      upsert: async ({ where, create }: AnyRow) => {
        let o = owners.find((x) => x.userId === where.userId_agencyId.userId && x.agencyId === where.userId_agencyId.agencyId);
        if (!o) {
          o = { id: uuid(seq++), ...create };
          owners.push(o);
        }
        return o;
      },
      findMany: async ({ where }: AnyRow) => owners.filter((o) => o.userId === where.userId),
      findFirst: async ({ where }: AnyRow) =>
        owners.find((o) => o.id === where.id && (!where.agencyId || o.agencyId === where.agencyId)) ?? null,
    },
    listing: {
      create: async ({ data }: AnyRow) => {
        const row = { id: uuid(seq++), status: 'available', originalsVerified: false, publishedAt: null, createdAt: new Date(), ...data };
        listings.push(row);
        return row;
      },
      findFirst: async ({ where }: AnyRow) => {
        const l = listings.find((x) => matchListing(x, where));
        if (!l) return null;
        return {
          ...l,
          owner: { user: users.find((u) => u.id === (owners.find((o) => o.id === l.ownerId)?.userId)) ?? { name: null, phone: null } },
          ownerDocs: [],
          agency: agencies.find((a) => a.id === l.agencyId),
        };
      },
      findMany: async ({ where }: AnyRow) =>
        listings
          .filter((l) => matchListing(l, where))
          .map((l) => ({ ...l, agency: agencies.find((a) => a.id === l.agencyId) })),
      count: async ({ where }: AnyRow) => listings.filter((l) => matchListing(l, where)).length,
      aggregate: async () => ({ _max: { rentUsd: 500, bedrooms: 3 } }),
      update: async ({ where, data }: AnyRow) => {
        const l = listings.find((x) => x.id === where.id)!;
        Object.assign(l, data);
        return l;
      },
    },
    deal: { count: async () => 0 },
    lease: { count: async () => 0 },
  } as unknown as PrismaService;

  const storage = {
    processPhotoToWebp: async (b: Buffer) => b,
    putObject: async () => undefined,
    presignGet: async (key: string) => `https://signed.test/${key}`,
  } as unknown as StorageService;
  const auditSvc = {
    log: async (e: AnyRow) => { audit.push({ action: e.action, objectType: e.objectType, objectId: e.objectId }); },
  } as unknown as AuditService;
  const notify = {
    notify: async (i: AnyRow) => { notifications.push({ userId: i.userId, template: i.template }); return { sent: false }; },
  } as unknown as NotificationsService;

  const listingsSvc = new ListingsService(prisma, storage, auditSvc, notify);
  const intakesSvc = new IntakesService(prisma, storage, auditSvc, notify, listingsSvc);
  const directory = new AgenciesDirectoryService(prisma);
  const meCtrl = new MeController(prisma, { get: () => '' } as unknown as ConfigService);

  const ctxA = { agencyId: AGENCY_A, roles: ['admin'] as ('admin' | 'agent')[], canVerify: true };
  const photo = { buffer: Buffer.from('img') };

  return {
    intakesSvc, listingsSvc, directory, meCtrl, prisma,
    ids: { AGENCY_A, AGENCY_B, CUSTOMER, AGENT }, ctxA, photo,
    data: { intakes, owners, listings, notifications, audit, agencies },
  };
}

const baseSubmit = (agencyId: string) => ({
  agencyId, district: 'Hodan', type: 'house' as const, bedrooms: 3, bathrooms: 2, expectedRentUsd: 400, notes: 'nice',
});

// ─────────────────────────────────────────────────────────────────────────────

describe('§15 intake — never public before conversion (rule 6)', () => {
  let w: ReturnType<typeof makeWorld>;
  beforeEach(() => { w = makeWorld(); });

  it('a submitted, then accepted, intake never appears in public browse or detail', async () => {
    const { intakesSvc, listingsSvc, ids, ctxA, photo } = w;
    const intake = await intakesSvc.submit(ids.CUSTOMER, baseSubmit(ids.AGENCY_A), { photos: [photo] });

    // submitted → nothing browseable, and the intake id is not a listing id
    let browse = await listingsSvc.publicList({ page: 1 } as any);
    expect(browse.items).toHaveLength(0);
    await expect(listingsSvc.publicDetail(intake.id)).rejects.toBeInstanceOf(NotFoundException);

    // accepted → still invisible
    await intakesSvc.accept(ctxA, ids.AGENT, intake.id);
    browse = await listingsSvc.publicList({ page: 1 } as any);
    expect(browse.items).toHaveLength(0);

    // converted but not yet published → the draft listing is STILL invisible
    await intakesSvc.convert(ctxA, ids.AGENT, intake.id);
    browse = await listingsSvc.publicList({ page: 1 } as any);
    expect(browse.items).toHaveLength(0);
  });
});

describe('§15 rule 15 — submitting grants the owner role, no second account', () => {
  it('a plain customer becomes an owner by submitting, without an owners row', async () => {
    const { intakesSvc, meCtrl, ids, photo, data } = makeWorld();

    let me = await (meCtrl as any).serialize(ids.CUSTOMER);
    expect(me.roles.owner).toBe(false); // just a customer

    await intakesSvc.submit(ids.CUSTOMER, baseSubmit(ids.AGENCY_A), { photos: [photo] });

    me = await (meCtrl as any).serialize(ids.CUSTOMER);
    expect(me.roles.owner).toBe(true); // now an owner…
    expect(me.roles.customer).toBe(true); // …still the same one account
    expect(data.owners).toHaveLength(0); // …with NO premature agency tie
  });
});

describe('§15 convert — creates a listing via the publish path, permanent tie', () => {
  it('convert links the owner, prefilling a listing that publishes into browse', async () => {
    const { intakesSvc, listingsSvc, ids, ctxA, photo, data } = makeWorld();
    const intake = await intakesSvc.submit(ids.CUSTOMER, baseSubmit(ids.AGENCY_A), { photos: [photo] });
    await intakesSvc.accept(ctxA, ids.AGENT, intake.id);

    const { listing } = await intakesSvc.convert(ctxA, ids.AGENT, intake.id);

    // intake converted + linked; owner tie created (permanent from here)
    expect(data.intakes[0].status).toBe('converted');
    expect(data.intakes[0].listingId).toBe(listing.id);
    expect(data.owners).toHaveLength(1);
    expect(data.owners[0].userId).toBe(ids.CUSTOMER);
    expect(data.owners[0].agencyId).toBe(ids.AGENCY_A);
    // listing prefilled from the intake, reusing its photos
    expect(listing.district).toBe('Hodan');
    expect(listing.photos.length).toBe(1);

    // now the agency verifies + publishes via the SAME existing path…
    data.listings[0].originalsVerified = true; // agency ticks originals at meetup
    await listingsSvc.publish(ctxA, ids.AGENT, listing.id);

    // …and for the FIRST time the house is publicly visible
    const browse = await listingsSvc.publicList({ page: 1 } as any);
    expect(browse.items).toHaveLength(1);
    expect(browse.items[0].id).toBe(listing.id);
    // owner notified their listing went live (§7)
    expect(data.notifications.some((n) => n.template === 'intake_published' && n.userId === ids.CUSTOMER)).toBe(true);
  });
});

describe('§15 owner pre-screen docs — agency + admin only, never public', () => {
  it('the owning agency can presign a doc (audited); another agency cannot', async () => {
    const { intakesSvc, ids, ctxA, photo, data } = makeWorld();
    const intake = await intakesSvc.submit(
      ids.CUSTOMER,
      baseSubmit(ids.AGENCY_A),
      { photos: [photo], docs: [{ buffer: Buffer.from('deed'), originalname: 'deed.pdf', mimetype: 'application/pdf' }] },
    );

    const res = await intakesSvc.issueDocUrl(ctxA, ids.AGENT, intake.id, 0);
    expect(res.url).toContain('intake-docs/');
    expect(data.audit.some((a) => a.action === 'document.url_issued' && a.objectType === 'intake_document')).toBe(true);

    // a different agency can't even see the intake exists
    const ctxB = { agencyId: ids.AGENCY_B, roles: ['admin'] as ('admin' | 'agent')[], canVerify: true };
    await expect(intakesSvc.issueDocUrl(ctxB, ids.AGENT, intake.id, 0)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('§15 timer — 5-day expiry, then owner reassigns', () => {
  it('a stale submitted intake expires and can be re-sent to another agency', async () => {
    const { intakesSvc, ids, photo, data } = makeWorld();
    const intake = await intakesSvc.submit(ids.CUSTOMER, baseSubmit(ids.AGENCY_A), { photos: [photo] });
    // age it 6 days
    data.intakes[0].createdAt = new Date(Date.now() - 6 * 86_400_000);

    const expired = await intakesSvc.expireStaleSubmitted(new Date());
    expect(expired).toBe(1);
    expect(data.intakes[0].status).toBe('expired');
    expect(data.notifications.some((n) => n.template === 'intake_expired' && n.userId === ids.CUSTOMER)).toBe(true);

    // owner reassigns the SAME intake to a different active agency
    const re = await intakesSvc.reassign(ids.CUSTOMER, intake.id, ids.AGENCY_B);
    expect(re.status).toBe('submitted');
    expect(data.intakes[0].agencyId).toBe(ids.AGENCY_B);
  });
});

describe('§15 tie timing — reassign before conversion, permanent after', () => {
  it('a declined intake reassigns; a converted intake cannot (tie is permanent)', async () => {
    const { intakesSvc, ids, ctxA, photo, data } = makeWorld();

    // decline path → reassignable
    const a = await intakesSvc.submit(ids.CUSTOMER, baseSubmit(ids.AGENCY_A), { photos: [photo] });
    await intakesSvc.declineOrAbandon(ctxA, ids.AGENT, a.id, 'not a fit');
    expect(data.intakes[0].status).toBe('declined');
    const re = await intakesSvc.reassign(ids.CUSTOMER, a.id, ids.AGENCY_B);
    expect(re.status).toBe('submitted');
    expect(data.intakes[0].agencyId).toBe(ids.AGENCY_B);

    // conversion path → tie permanent, no reassign
    const b = await intakesSvc.submit(ids.CUSTOMER, baseSubmit(ids.AGENCY_A), { photos: [photo] });
    await intakesSvc.accept(ctxA, ids.AGENT, b.id);
    await intakesSvc.convert(ctxA, ids.AGENT, b.id);
    await expect(intakesSvc.reassign(ids.CUSTOMER, b.id, ids.AGENCY_B)).rejects.toBeInstanceOf(BadRequestException);
    // the owner remains permanently tied to the converting agency
    expect(data.owners.some((o) => o.userId === ids.CUSTOMER && o.agencyId === ids.AGENCY_A)).toBe(true);
  });
});

describe('§15 public directory — active agencies with live-listing counts', () => {
  it('lists only active agencies, filterable by district', async () => {
    const { directory } = makeWorld();
    const all = await directory.list();
    expect(all.every((a) => a.name !== 'Pending Co')).toBe(true); // pending hidden
    const hodan = await directory.list('Hodan');
    expect(hodan.map((a) => a.name)).toContain('Karan Realty');
    expect(hodan.some((a) => a.name === 'Shabelle Homes')).toBe(false); // wrong district
  });
});
