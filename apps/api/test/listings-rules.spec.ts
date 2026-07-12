import { describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ListingsService } from '../src/listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { StorageService } from '../src/storage/storage.service';
import type { AuditService } from '../src/audit/audit.service';
import type { NotificationsService } from '../src/notifications/notifications.service';

const AGENCY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AGENCY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LISTING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type ListingRow = {
  id: string;
  agencyId: string;
  originalsVerified: boolean;
  publishedAt: Date | null;
  photos: string[];
};

// A tiny in-memory prisma double that honours the agencyId filter — the same
// filter the real service always sends — so cross-agency reads return null
// exactly like Postgres would.
function makePrisma(listing: ListingRow) {
  const updates: Array<Record<string, unknown>> = [];
  const prisma = {
    updates,
    listing: {
      findFirst: async ({ where }: { where: { id: string; agencyId: string } }) =>
        where.id === listing.id && where.agencyId === listing.agencyId ? listing : null,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return listing;
      },
    },
    deal: { count: async () => 0 },
    lease: { count: async () => 0 },
    // publish() checks for an originating intake to notify the owner; none here.
    intake: { findFirst: async () => null },
  };
  return prisma as unknown as PrismaService & { updates: typeof updates };
}

const notificationsStub = {
  notify: async () => ({ sent: false }),
} as unknown as NotificationsService;

const storageStub = {
  presignGet: async () => 'https://example.test/presigned',
} as unknown as StorageService;

const auditStub = { log: async () => undefined } as unknown as AuditService;

function makeService(listing: ListingRow) {
  const prisma = makePrisma(listing);
  return { service: new ListingsService(prisma, storageStub, auditStub, notificationsStub), prisma };
}

describe('agency scoping (CLAUDE.md rule 3)', () => {
  it('one agency cannot read another agency’s listing', async () => {
    const { service } = makeService({
      id: LISTING_ID,
      agencyId: AGENCY_A,
      originalsVerified: true,
      publishedAt: null,
      photos: ['photos/x.webp'],
    });
    await expect(
      service.detail({ agencyId: AGENCY_B, roles: ['admin'], canVerify: true }, LISTING_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.publish({ agencyId: AGENCY_B, roles: ['admin'], canVerify: true }, 'actor', LISTING_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('publish gate', () => {
  it('rejects publish when originals_verified is not ticked', async () => {
    const { service } = makeService({
      id: LISTING_ID,
      agencyId: AGENCY_A,
      originalsVerified: false,
      publishedAt: null,
      photos: ['photos/x.webp'],
    });
    await expect(
      service.publish({ agencyId: AGENCY_A, roles: ['agent'], canVerify: false }, 'actor', LISTING_ID),
    ).rejects.toMatchObject(
      new BadRequestException('originals_not_verified'),
    );
  });

  it('publishes when attested, and status comes out of the derivation rule', async () => {
    const listing: ListingRow = {
      id: LISTING_ID,
      agencyId: AGENCY_A,
      originalsVerified: true,
      publishedAt: null,
      photos: ['photos/x.webp'],
    };
    const { service, prisma } = makeService(listing);
    // detail() is called at the end; it uses findFirst with include — extend stub.
    (prisma.listing as { findFirst: unknown }).findFirst = async ({
      where,
    }: {
      where: { id: string; agencyId: string };
    }) =>
      where.id === listing.id && where.agencyId === listing.agencyId
        ? {
            ...listing,
            owner: { user: { name: 'O', phone: '+252600000000' } },
            ownerDocs: [],
            ownerId: 'owner',
            district: 'Hodan',
            neighborhood: null,
            type: 'house',
            bedrooms: 2,
            bathrooms: 1,
            rentUsd: 500,
            depositUsd: 500,
            descriptionSo: 'x',
            descriptionEn: 'x',
            status: 'available',
            createdAt: new Date(),
          }
        : null;

    await service.publish({ agencyId: AGENCY_A, roles: ['agent'], canVerify: false }, 'actor', LISTING_ID);

    const statusWrites = prisma.updates.filter((u) => 'status' in u);
    expect(statusWrites).toHaveLength(1);
    // no live lease + no reserving deal → derived `available`, never hand-set
    expect(statusWrites[0].status).toBe('available');
    expect(prisma.updates.some((u) => u.publishedAt instanceof Date)).toBe(true);
  });
});
