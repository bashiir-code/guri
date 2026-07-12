import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DealStateService } from '../src/deals/deal-state.service';
import { DocumentsService } from '../src/deals/documents.service';
import { ListingsService } from '../src/listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { StorageService } from '../src/storage/storage.service';
import type { AuditService } from '../src/audit/audit.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { AgencyContext } from '../src/auth/agency.guard';

const LISTING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CTX_A_VERIFIER: AgencyContext = { agencyId: 'agency-a', roles: ['admin'], canVerify: true };
const CTX_A_AGENT: AgencyContext = { agencyId: 'agency-a', roles: ['agent'], canVerify: false };
const CTX_B_VERIFIER: AgencyContext = { agencyId: 'agency-b', roles: ['admin'], canVerify: true };

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
interface DocRow {
  id: string;
  dealId: string;
  customerId: string;
  idType: string;
  capturedVia: string;
  fileKey: string;
  status: string;
  reviewNote: string | null;
  reviewedById: string | null;
  createdAt: Date;
}

function makeWorld() {
  const listing = {
    id: LISTING_ID,
    agencyId: 'agency-a',
    status: 'available' as string,
    publishedAt: new Date(),
    photos: [] as string[],
    agency: { name: 'Hodan Homes', phone: '+252612000000' },
  };
  const deals: DealRow[] = [];
  const docs: DocRow[] = [];
  const events: Array<{ dealId: string; fromState: string | null; toState: string; actorId: string | null }> = [];
  const auditRows: Array<{ actorId: string | null; action: string; objectType: string; objectId: string }> = [];
  const customers: Record<string, { id: string; name: string; phone: string | null }> = {
    'cust-1': { id: 'cust-1', name: 'Khadra', phone: '+252600000001' },
    'cust-2': { id: 'cust-2', name: 'Liban', phone: '+252600000002' },
  };
  const memberships: Record<string, { agencyId: string; canVerify: boolean }> = {
    'ver-a': { agencyId: 'agency-a', canVerify: true },
    'agent-a': { agencyId: 'agency-a', canVerify: false },
    'ver-b': { agencyId: 'agency-b', canVerify: true },
  };
  const matchesIn = (v: string, f?: { in: string[] }) => !f || f.in.includes(v);

  const prisma = {
    listing: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        where.id === listing.id ? listing : null,
      update: async ({ data }: { data: { status: string } }) => {
        listing.status = data.status;
        return listing;
      },
    },
    deal: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.customerId) {
          return (
            deals.find(
              (d) =>
                d.customerId === where.customerId &&
                matchesIn(d.state, where.state as { in: string[] }),
            ) ?? null
          );
        }
        if (typeof where.id === 'string' && where.listing) {
          const d = deals.find((x) => x.id === where.id);
          const agencyId = (where.listing as { agencyId: string }).agencyId;
          if (!d || listing.agencyId !== agencyId) return null;
          return { ...d, listing, customer: customers[d.customerId] };
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
          ? {
              ...d,
              listing: { id: listing.id, agencyId: listing.agencyId },
              customer: customers[d.customerId],
            }
          : null;
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
    customerDocument: {
      create: async ({ data }: { data: Partial<DocRow> }) => {
        const doc: DocRow = {
          id: `doc-${docs.length + 1}`,
          reviewNote: null,
          reviewedById: null,
          createdAt: new Date(),
          ...(data as DocRow),
        };
        docs.push(doc);
        return { ...doc };
      },
      findFirst: async ({ where }: { where: { dealId: string } }) => {
        const list = docs.filter((d) => d.dealId === where.dealId);
        return list.length ? { ...list[list.length - 1] } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<DocRow> }) => {
        const doc = docs.find((d) => d.id === where.id)!;
        Object.assign(doc, data);
        return { ...doc };
      },
    },
    dealEvent: {
      create: async ({ data }: { data: (typeof events)[number] }) => {
        events.push(data);
        return data;
      },
    },
    lease: { count: async () => 0 },
    agencyMember: {
      findMany: async () => [],
      findFirst: async ({ where }: { where: { userId: string } }) => {
        const m = memberships[where.userId];
        return m ? { userId: where.userId, ...m, active: true } : null;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        email: null,
        isPlatformAdmin: false,
      }),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };

  const storageStub = {
    presignGet: async () => 'https://signed.example/doc',
    putObject: async () => undefined,
    processPhotoToWebp: async (b: Buffer) => b,
  } as unknown as StorageService;
  const audit = {
    log: async (entry: (typeof auditRows)[number]) => {
      auditRows.push(entry);
    },
  } as unknown as AuditService;
  const notificationsStub = {
    recordInApp: async () => undefined,
    sendSms: async () => undefined,
  } as unknown as NotificationsService;
  const configStub = { get: () => '' } as unknown as ConfigService;

  const listingsService = new ListingsService(prisma as unknown as PrismaService, storageStub, audit, notificationsStub);
  const dealState = new DealStateService(
    prisma as unknown as PrismaService,
    listingsService,
    notificationsStub,
    audit,
  );
  const documents = new DocumentsService(
    prisma as unknown as PrismaService,
    storageStub,
    audit,
    notificationsStub,
    dealState,
    configStub,
  );
  return { dealState, documents, deals, docs, events, auditRows, listing };
}

const CTX = CTX_A_VERIFIER;
const FILE = { buffer: Buffer.from('fake-id-photo') };
const META = { idType: 'national_id', capturedVia: 'camera' } as const;

// request → select → proceed → awaiting_docs, plus a second queued request
async function reachAwaitingDocs(w: ReturnType<typeof makeWorld>) {
  const d1 = await w.dealState.createRequest(LISTING_ID, 'cust-1');
  const d2 = await w.dealState.createRequest(LISTING_ID, 'cust-2');
  await w.dealState.select(CTX, 'ver-a', d1.id, new Date());
  await w.dealState.viewingOutcome(CTX, 'ver-a', d1.id, 'proceed');
  return { d1, d2 };
}

describe('phase 4 — ID capture + verification (§3/§4/§9)', () => {
  it('1. upload moves the deal to docs_in_review and writes a deal_events row', async () => {
    const w = makeWorld();
    const { d1 } = await reachAwaitingDocs(w);
    const res = await w.documents.upload('cust-1', d1.id, META, FILE);
    expect(res.deal.state).toBe('docs_in_review');
    expect(res.document.status).toBe('pending');
    expect(w.events.at(-1)).toMatchObject({
      dealId: d1.id,
      fromState: 'awaiting_docs',
      toState: 'docs_in_review',
      actorId: 'cust-1',
    });
  });

  it('2. a member WITHOUT can_verify gets 403 on verify and on the document URL', async () => {
    const w = makeWorld();
    const { d1 } = await reachAwaitingDocs(w);
    await w.documents.upload('cust-1', d1.id, META, FILE);
    await expect(
      w.documents.verify(CTX_A_AGENT, 'agent-a', d1.id, { decision: 'approve' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.documents.issueUrl('agent-a', d1.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('3. a can_verify member of a DIFFERENT agency gets 403 on both', async () => {
    const w = makeWorld();
    const { d1 } = await reachAwaitingDocs(w);
    await w.documents.upload('cust-1', d1.id, META, FILE);
    await expect(
      w.documents.verify(CTX_B_VERIFIER, 'ver-b', d1.id, { decision: 'approve' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(w.documents.issueUrl('ver-b', d1.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('4. every issued URL wrote audit_log; the verify decision is its own action', async () => {
    const w = makeWorld();
    const { d1 } = await reachAwaitingDocs(w);
    await w.documents.upload('cust-1', d1.id, META, FILE);
    await w.documents.issueUrl('ver-a', d1.id);
    await w.documents.issueUrl('ver-a', d1.id);
    await w.documents.verify(CTX, 'ver-a', d1.id, { decision: 'approve' });

    const urlRows = w.auditRows.filter((r) => r.action === 'document.url_issued');
    expect(urlRows).toHaveLength(2);
    expect(urlRows.every((r) => r.actorId === 'ver-a')).toBe(true);
    // the decision stands alone — its own distinct action (rule 4)
    const decisionRows = w.auditRows.filter((r) => r.action === 'deal.verify_approved');
    expect(decisionRows).toHaveLength(1);
    expect(decisionRows[0]).toMatchObject({ actorId: 'ver-a', objectType: 'deal', objectId: d1.id });
  });

  it('5. approve keeps the listing reserved; reject releases it with the queue intact', async () => {
    // approve path
    const w1 = makeWorld();
    const a = await reachAwaitingDocs(w1);
    await w1.documents.upload('cust-1', a.d1.id, META, FILE);
    const approved = await w1.documents.verify(CTX, 'ver-a', a.d1.id, { decision: 'approve' });
    expect(approved.state).toBe('approved');
    expect(w1.listing.status).toBe('reserved');

    // reject path
    const w2 = makeWorld();
    const b = await reachAwaitingDocs(w2);
    await w2.documents.upload('cust-1', b.d1.id, META, FILE);
    const rejected = await w2.documents.verify(CTX, 'ver-a', b.d1.id, {
      decision: 'reject',
      note: 'photo too blurry',
    });
    expect(rejected.state).toBe('docs_rejected');
    expect(w2.listing.status).toBe('available');
    expect(w2.deals.find((d) => d.id === b.d2.id)!.state).toBe('requested'); // queue intact
    expect(w2.docs.at(-1)).toMatchObject({ status: 'rejected', reviewNote: 'photo too blurry' });
  });

  it('6. the customer can fetch their own document URL; another customer cannot', async () => {
    const w = makeWorld();
    const { d1 } = await reachAwaitingDocs(w);
    await w.documents.upload('cust-1', d1.id, META, FILE);
    const own = await w.documents.issueUrl('cust-1', d1.id);
    expect(own.url).toContain('https://');
    expect(w.auditRows.some((r) => r.action === 'document.url_issued' && r.actorId === 'cust-1')).toBe(true);
    await expect(w.documents.issueUrl('cust-2', d1.id)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
