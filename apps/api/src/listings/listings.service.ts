import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  deriveListingStatus,
  BROWSE_PAGE_SIZE,
  DEAL_RESERVING_STATES,
  LEASE_LIVE_STATUSES,
  type BrowseQueryInput,
  type ListingFieldsInput,
  type UpdateListingInput,
} from '@guri/shared';
import type { DealState, LeaseStatus, ListingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  StorageService,
  PHOTO_URL_TTL_SECONDS,
  DOCUMENT_URL_TTL_SECONDS,
} from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AgencyContext } from '../auth/agency.guard';

const MAX_PHOTOS = 12;

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // Every read/write is filtered by ctx.agencyId (CLAUDE.md rule 3): a
  // cross-agency id simply doesn't exist from the caller's point of view.
  private async findScoped(ctx: AgencyContext, id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, agencyId: ctx.agencyId },
    });
    if (!listing) throw new NotFoundException('listing_not_found');
    return listing;
  }

  private async assertOwnerInAgency(ctx: AgencyContext, ownerId: string) {
    const owner = await this.prisma.owner.findFirst({
      where: { id: ownerId, agencyId: ctx.agencyId },
    });
    if (!owner) throw new BadRequestException('owner_not_in_agency');
    return owner;
  }

  // SPEC §3: status is derived, never written directly. This is the only
  // place that persists it, and only as the output of the shared rule.
  async recomputeStatus(listingId: string): Promise<void> {
    const [reservingDeals, liveLeases] = await Promise.all([
      this.prisma.deal.count({
        where: { listingId, state: { in: DEAL_RESERVING_STATES as unknown as DealState[] } },
      }),
      this.prisma.lease.count({
        where: { listingId, status: { in: LEASE_LIVE_STATUSES as unknown as LeaseStatus[] } },
      }),
    ]);
    const status = deriveListingStatus({
      hasLiveLease: liveLeases > 0,
      hasReservingDeal: reservingDeals > 0,
    });
    await this.prisma.listing.update({ where: { id: listingId }, data: { status } });
  }

  async create(ctx: AgencyContext, actorId: string, input: ListingFieldsInput) {
    await this.assertOwnerInAgency(ctx, input.ownerId);
    const listing = await this.prisma.listing.create({
      data: {
        agencyId: ctx.agencyId,
        ownerId: input.ownerId,
        district: input.district,
        neighborhood: input.neighborhood,
        type: input.type,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        rentUsd: input.rentUsd,
        depositUsd: input.depositUsd,
        descriptionSo: input.descriptionSo,
        descriptionEn: input.descriptionEn,
      },
    });
    await this.audit.log({
      actorId,
      action: 'listing.created',
      objectType: 'listing',
      objectId: listing.id,
    });
    return this.detail(ctx, listing.id);
  }

  async update(ctx: AgencyContext, actorId: string, id: string, input: UpdateListingInput) {
    await this.findScoped(ctx, id);
    if (input.ownerId) await this.assertOwnerInAgency(ctx, input.ownerId);
    await this.prisma.listing.update({
      where: { id },
      data: {
        ownerId: input.ownerId,
        district: input.district,
        neighborhood: input.neighborhood,
        type: input.type,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        rentUsd: input.rentUsd,
        depositUsd: input.depositUsd,
        descriptionSo: input.descriptionSo,
        descriptionEn: input.descriptionEn,
        originalsVerified: input.originalsVerified,
      },
    });
    await this.audit.log({
      actorId,
      action: 'listing.updated',
      objectType: 'listing',
      objectId: id,
      meta: { fields: Object.keys(input) },
    });
    return this.detail(ctx, id);
  }

  async list(ctx: AgencyContext) {
    const listings = await this.prisma.listing.findMany({
      where: { agencyId: ctx.agencyId },
      orderBy: { createdAt: 'desc' },
      include: { owner: { include: { user: { select: { name: true, phone: true } } } } },
    });
    return Promise.all(
      listings.map(async (l) => ({
        id: l.id,
        district: l.district,
        neighborhood: l.neighborhood,
        type: l.type,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        rentUsd: Number(l.rentUsd),
        status: l.status,
        publishedAt: l.publishedAt,
        ownerName: l.owner.user.name,
        coverUrl: l.photos[0]
          ? await this.storage.presignGet(l.photos[0], PHOTO_URL_TTL_SECONDS)
          : null,
        createdAt: l.createdAt,
      })),
    );
  }

  async detail(ctx: AgencyContext, id: string) {
    const l = await this.prisma.listing.findFirst({
      where: { id, agencyId: ctx.agencyId },
      include: {
        owner: { include: { user: { select: { name: true, phone: true } } } },
        ownerDocs: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!l) throw new NotFoundException('listing_not_found');
    return {
      id: l.id,
      ownerId: l.ownerId,
      ownerName: l.owner.user.name,
      ownerPhone: l.owner.user.phone,
      district: l.district,
      neighborhood: l.neighborhood,
      type: l.type,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      rentUsd: Number(l.rentUsd),
      depositUsd: Number(l.depositUsd),
      descriptionSo: l.descriptionSo,
      descriptionEn: l.descriptionEn,
      status: l.status,
      originalsVerified: l.originalsVerified,
      publishedAt: l.publishedAt,
      photos: await Promise.all(
        l.photos.map(async (key) => ({
          key,
          url: await this.storage.presignGet(key, PHOTO_URL_TTL_SECONDS),
        })),
      ),
      ownerDocs: l.ownerDocs.map((d) => ({
        id: d.id,
        label: d.label,
        note: d.note,
        createdAt: d.createdAt,
      })),
      createdAt: l.createdAt,
    };
  }

  async addPhotos(
    ctx: AgencyContext,
    actorId: string,
    id: string,
    files: Array<{ buffer: Buffer }>,
  ) {
    const listing = await this.findScoped(ctx, id);
    if (files.length === 0) throw new BadRequestException('no_files');
    if (listing.photos.length + files.length > MAX_PHOTOS) {
      throw new BadRequestException('too_many_photos');
    }
    const keys: string[] = [];
    for (const file of files) {
      const webp = await this.storage.processPhotoToWebp(file.buffer);
      const key = `photos/${id}/${randomUUID()}.webp`;
      await this.storage.putObject(key, webp, 'image/webp');
      keys.push(key);
    }
    await this.prisma.listing.update({
      where: { id },
      data: { photos: { push: keys } },
    });
    await this.audit.log({
      actorId,
      action: 'listing.photos_added',
      objectType: 'listing',
      objectId: id,
      meta: { count: keys.length },
    });
    return this.detail(ctx, id);
  }

  async addOwnerDoc(
    ctx: AgencyContext,
    actorId: string,
    id: string,
    meta: { label: string; note?: string },
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    const listing = await this.findScoped(ctx, id);
    const ext = (file.originalname.split('.').pop() ?? 'bin').toLowerCase().slice(0, 8);
    const key = `owner-docs/${listing.ownerId}/${randomUUID()}.${ext}`;
    await this.storage.putObject(key, file.buffer, file.mimetype || 'application/octet-stream');
    const doc = await this.prisma.ownerDocument.create({
      data: {
        ownerId: listing.ownerId,
        listingId: id,
        label: meta.label,
        note: meta.note,
        fileKey: key,
        uploadedById: actorId,
      },
    });
    await this.audit.log({
      actorId,
      action: 'document.uploaded',
      objectType: 'owner_document',
      objectId: doc.id,
      meta: { listingId: id, label: meta.label },
    });
    return { id: doc.id, label: doc.label, note: doc.note, createdAt: doc.createdAt };
  }

  // §9 / CLAUDE.md rule 5: documents are served only via short-lived presigned
  // URLs after a role check, and every issued URL is written to audit_log.
  async issueOwnerDocUrl(ctx: AgencyContext, actorId: string, docId: string) {
    const doc = await this.prisma.ownerDocument.findFirst({
      where: { id: docId, owner: { agencyId: ctx.agencyId } },
    });
    if (!doc) throw new NotFoundException('document_not_found');
    const url = await this.storage.presignGet(doc.fileKey, DOCUMENT_URL_TTL_SECONDS);
    await this.audit.log({
      actorId,
      action: 'document.url_issued',
      objectType: 'owner_document',
      objectId: doc.id,
      meta: { listingId: doc.listingId, expiresInSeconds: DOCUMENT_URL_TTL_SECONDS },
    });
    return { url, expiresInSeconds: DOCUMENT_URL_TTL_SECONDS };
  }

  // ---------- public browse (no auth, SPEC §5/§6) ----------
  // Only published listings that are available or reserved appear; drafts and
  // rented homes never do, and intakes have no path here at all (§15).

  private publicWhere() {
    return {
      publishedAt: { not: null },
      status: { in: ['available', 'reserved'] as ListingStatus[] },
      // §17: a suspended (or not-yet-active) agency's listings drop out of
      // public browse and search entirely — suspension fully takes effect,
      // not just at the guard. Reactivation brings them straight back.
      agency: { status: 'active' as const },
    };
  }

  async publicList(query: BrowseQueryInput) {
    const where = {
      ...this.publicWhere(),
      ...(query.district ? { district: query.district } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.beds !== undefined ? { bedrooms: { gte: query.beds } } : {}),
      ...(query.minRent !== undefined || query.maxRent !== undefined
        ? { rentUsd: { gte: query.minRent, lte: query.maxRent } }
        : {}),
    };
    const orderBy =
      query.sort === 'price_asc'
        ? ({ rentUsd: 'asc' } as const)
        : query.sort === 'price_desc'
          ? ({ rentUsd: 'desc' } as const)
          : ({ publishedAt: 'desc' } as const);

    const [total, rows, aggregates] = await this.prisma.$transaction([
      this.prisma.listing.count({ where }),
      this.prisma.listing.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * BROWSE_PAGE_SIZE,
        take: BROWSE_PAGE_SIZE,
      }),
      // Slider bounds for the UI: the max rent / bedrooms across everything
      // currently browsable (unfiltered), so the range always fits the market.
      this.prisma.listing.aggregate({
        where: this.publicWhere(),
        _max: { rentUsd: true, bedrooms: true },
      }),
    ]);

    const rawMaxRent = Number(aggregates._max.rentUsd ?? 0);
    const bounds = {
      // rounded up to a friendly step; sensible floors for a sparse market
      maxRent: Math.max(Math.ceil(rawMaxRent / 50) * 50, 100),
      maxBedrooms: Math.max(aggregates._max.bedrooms ?? 0, 5),
    };

    const items = await Promise.all(
      rows.map(async (l) => ({
        id: l.id,
        district: l.district,
        neighborhood: l.neighborhood,
        type: l.type,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        rentUsd: Number(l.rentUsd),
        status: l.status,
        coverUrl: l.photos[0]
          ? await this.storage.presignGet(l.photos[0], PHOTO_URL_TTL_SECONDS)
          : null,
      })),
    );
    return {
      items,
      page: query.page,
      pageSize: BROWSE_PAGE_SIZE,
      total,
      hasMore: query.page * BROWSE_PAGE_SIZE < total,
      bounds,
    };
  }

  async publicDetail(id: string) {
    const l = await this.prisma.listing.findFirst({
      where: { id, ...this.publicWhere() },
      include: { agency: { select: { name: true, phone: true } } },
    });
    if (!l) throw new NotFoundException('listing_not_found');
    return {
      id: l.id,
      district: l.district,
      neighborhood: l.neighborhood,
      type: l.type,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      rentUsd: Number(l.rentUsd),
      depositUsd: Number(l.depositUsd),
      descriptionSo: l.descriptionSo,
      descriptionEn: l.descriptionEn,
      status: l.status,
      photos: await Promise.all(
        l.photos.map((key) => this.storage.presignGet(key, PHOTO_URL_TTL_SECONDS)),
      ),
      // Customers talk to the agency, never the owner (§2).
      agency: {
        name: l.agency.name,
        phone: l.agency.phone,
        waUrl: `https://wa.me/${l.agency.phone.replace(/[^0-9]/g, '')}`,
      },
    };
  }

  // Publish gate: requires the originals-verified attestation. Status is NOT
  // set here — it is recomputed through the shared derivation rule.
  async publish(ctx: AgencyContext, actorId: string, id: string) {
    const listing = await this.findScoped(ctx, id);
    if (listing.publishedAt) throw new BadRequestException('already_published');
    if (!listing.originalsVerified) {
      throw new BadRequestException('originals_not_verified');
    }
    if (listing.photos.length === 0) throw new BadRequestException('no_photos');

    await this.prisma.listing.update({
      where: { id },
      data: { publishedAt: new Date() },
    });
    await this.recomputeStatus(id);
    await this.audit.log({
      actorId,
      action: 'listing.published',
      objectType: 'listing',
      objectId: id,
    });
    // §7/§15: if this listing came from an owner intake, tell the owner their
    // house is now live — the first moment it becomes publicly visible.
    await this.notifyIntakeOwnerOnPublish(id);
    return this.detail(ctx, id);
  }

  // A listing published from an intake links back via intake.listingId. This is
  // the only coupling between the generic publish path and §15 — the publish
  // logic itself stays single-sourced (rule 6: convert does not fork publish).
  private async notifyIntakeOwnerOnPublish(listingId: string): Promise<void> {
    const intake = await this.prisma.intake.findFirst({
      where: { listingId },
      include: { ownerUser: { select: { id: true, phone: true, locale: true } } },
    });
    if (!intake) return;
    await this.notifications.notify({
      userId: intake.ownerUser.id,
      phone: intake.ownerUser.phone,
      locale: intake.ownerUser.locale,
      template: 'intake_published',
      dedupeKey: `intake_published:${intake.id}`,
    });
  }
}
