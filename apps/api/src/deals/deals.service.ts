import { Injectable, NotFoundException } from '@nestjs/common';
import { DEAL_RESERVING_STATES } from '@guri/shared';
import type { DealState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService, PHOTO_URL_TTL_SECONDS } from '../storage/storage.service';
import { AgencyContext } from '../auth/agency.guard';
import { DealStateService } from './deal-state.service';

const RESERVING = DEAL_RESERVING_STATES as unknown as DealState[];

// Read side + party-scoped actions. Writes all go through DealStateService.
@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly dealState: DealStateService,
  ) {}

  async myRequests(customerId: string) {
    const deals = await this.prisma.deal.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { listing: true },
    });
    return Promise.all(
      deals.map(async (d) => ({
        id: d.id,
        state: d.state,
        viewingAt: d.viewingAt,
        createdAt: d.createdAt,
        listing: {
          id: d.listing.id,
          district: d.listing.district,
          neighborhood: d.listing.neighborhood,
          type: d.listing.type,
          bedrooms: d.listing.bedrooms,
          rentUsd: Number(d.listing.rentUsd),
          coverUrl: d.listing.photos[0]
            ? await this.storage.presignGet(d.listing.photos[0], PHOTO_URL_TTL_SECONDS)
            : null,
        },
      })),
    );
  }

  // Party-scoped view (§6): the customer sees their own deal; agency staff see
  // deals on their own agency's listings; everyone else gets a 404 — the deal
  // simply doesn't exist for them. Customer contact details appear only for
  // the agency viewer (§2: customers never see other customers).
  async getDealForParty(userId: string, dealId: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        listing: {
          select: {
            id: true,
            agencyId: true,
            district: true,
            neighborhood: true,
            rentUsd: true,
            depositUsd: true,
          },
        },
        customer: { select: { name: true, phone: true } },
        documents: { orderBy: { createdAt: 'desc' }, take: 1 },
        agreement: true,
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!deal) throw new NotFoundException('deal_not_found');

    const isCustomer = deal.customerId === userId;
    const isAgencyStaff =
      !isCustomer &&
      (await this.prisma.agencyMember.findFirst({
        where: { userId, agencyId: deal.listing.agencyId, active: true },
      })) !== null;
    if (!isCustomer && !isAgencyStaff) throw new NotFoundException('deal_not_found');

    return {
      id: deal.id,
      state: deal.state,
      viewingAt: deal.viewingAt,
      outcomeReason: deal.outcomeReason,
      createdAt: deal.createdAt,
      listing: {
        id: deal.listing.id,
        district: deal.listing.district,
        neighborhood: deal.listing.neighborhood,
        rentUsd: Number(deal.listing.rentUsd),
        depositUsd: Number(deal.listing.depositUsd),
      },
      agreement: deal.agreement
        ? {
            generatedAt: deal.agreement.generatedAt,
            signedAt: deal.agreement.signedAt,
            hasSignedScan: deal.agreement.signedScanKey !== null,
          }
        : null,
      customer: isCustomer
        ? undefined
        : { name: deal.customer.name, phone: deal.customer.phone },
      // Metadata only — the image itself always goes through the audited
      // presigned-URL endpoint after its own role check (§9).
      document: deal.documents[0]
        ? {
            id: deal.documents[0].id,
            idType: deal.documents[0].idType,
            capturedVia: deal.documents[0].capturedVia,
            status: deal.documents[0].status,
            reviewNote: deal.documents[0].reviewNote,
            uploadedAt: deal.documents[0].createdAt,
          }
        : null,
      timeline: deal.events.map((e) => ({
        fromState: e.fromState,
        toState: e.toState,
        at: e.createdAt,
      })),
      viewerRole: isCustomer ? 'customer' : 'agency',
    };
  }

  // §5 queue screen: requests oldest first + whoever holds the active slot.
  async listingQueue(ctx: AgencyContext, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, agencyId: ctx.agencyId },
    });
    if (!listing) throw new NotFoundException('listing_not_found');

    const [queue, active] = await Promise.all([
      this.prisma.deal.findMany({
        where: { listingId, state: 'requested' },
        orderBy: { createdAt: 'asc' },
        include: { customer: { select: { name: true, phone: true } } },
      }),
      this.prisma.deal.findFirst({
        where: { listingId, state: { in: RESERVING } },
        include: { customer: { select: { name: true, phone: true } } },
      }),
    ]);

    const serialize = (d: (typeof queue)[number]) => ({
      id: d.id,
      state: d.state,
      viewingAt: d.viewingAt,
      requestedAt: d.createdAt,
      customer: { name: d.customer.name, phone: d.customer.phone },
    });

    return {
      listing: {
        id: listing.id,
        district: listing.district,
        neighborhood: listing.neighborhood,
        rentUsd: Number(listing.rentUsd),
        status: listing.status,
        coverUrl: listing.photos[0]
          ? await this.storage.presignGet(listing.photos[0], PHOTO_URL_TTL_SECONDS)
          : null,
      },
      active: active ? serialize(active) : null,
      queue: queue.map(serialize),
    };
  }

  // §5 agency dashboard: today's viewings, unanswered requests, deals waiting
  // on documents, listings by status.
  async dashboard(ctx: AgencyContext) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    const agencyListing = { listing: { agencyId: ctx.agencyId } };

    const [todaysViewings, unansweredRequests, awaitingDocs, listings] = await Promise.all([
      this.prisma.deal.findMany({
        where: {
          ...agencyListing,
          state: 'viewing_scheduled',
          viewingAt: { gte: startOfDay, lt: endOfDay },
        },
        orderBy: { viewingAt: 'asc' },
        include: {
          customer: { select: { name: true, phone: true } },
          listing: { select: { id: true, district: true, neighborhood: true } },
        },
      }),
      this.prisma.deal.count({ where: { ...agencyListing, state: 'requested' } }),
      this.prisma.deal.count({ where: { ...agencyListing, state: 'awaiting_docs' } }),
      this.prisma.listing.findMany({
        where: { agencyId: ctx.agencyId },
        select: { status: true, publishedAt: true },
      }),
    ]);

    const byStatus = { draft: 0, available: 0, reserved: 0, rented: 0 };
    for (const l of listings) {
      if (!l.publishedAt) byStatus.draft += 1;
      else byStatus[l.status] += 1;
    }

    return {
      todaysViewings: todaysViewings.map((d) => ({
        dealId: d.id,
        viewingAt: d.viewingAt,
        customer: { name: d.customer.name, phone: d.customer.phone },
        listing: d.listing,
      })),
      unansweredRequests,
      awaitingDocs,
      listingsByStatus: byStatus,
    };
  }

  async withdraw(userId: string, dealId: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
    // 404, not 403 — don't reveal other customers' deals exist (§9).
    if (!deal || deal.customerId !== userId) throw new NotFoundException('deal_not_found');
    return this.dealState.transition(dealId, 'withdraw', userId);
  }
}
