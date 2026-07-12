import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DEAL_RESERVING_STATES, type UploadDocumentInput, type VerifyDealInput } from '@guri/shared';
import type { DealState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService, DOCUMENT_URL_TTL_SECONDS } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isAllowlistedAdmin } from '../auth/platform-admins';
import { AgencyContext } from '../auth/agency.guard';
import { DealStateService } from './deal-state.service';

const RESERVING = DEAL_RESERVING_STATES as unknown as DealState[];

// Customer ID documents (phase 4). State changes go through DealStateService;
// this service owns the files, the permission checks, and the audit rows.
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly dealState: DealStateService,
    private readonly config: ConfigService,
  ) {}

  private async loadDeal(dealId: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        listing: { select: { id: true, agencyId: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!deal) throw new NotFoundException('deal_not_found');
    return deal;
  }

  private async latestDocument(dealId: string) {
    return this.prisma.customerDocument.findFirst({
      where: { dealId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // POST /deals/:id/documents — the customer submits their ID photo.
  // awaiting_docs → docs_in_review, or docs_rejected → docs_in_review on
  // re-capture (which must win the active slot back first).
  async upload(
    userId: string,
    dealId: string,
    meta: UploadDocumentInput,
    file: { buffer: Buffer },
  ) {
    const deal = await this.loadDeal(dealId);
    if (deal.customerId !== userId) throw new NotFoundException('deal_not_found');
    if (deal.state !== 'awaiting_docs' && deal.state !== 'docs_rejected') {
      throw new BadRequestException('deal_not_awaiting_documents');
    }
    if (deal.state === 'docs_rejected') {
      const activeSlot = await this.prisma.deal.findFirst({
        where: { listingId: deal.listingId, id: { not: deal.id }, state: { in: RESERVING } },
      });
      if (activeSlot) throw new ConflictException('listing_already_reserved');
    }

    // Same pipeline as listing photos (§11): re-encoded to ≤1280px WebP,
    // stored in the SSE-encrypted bucket (§9).
    const webp = await this.storage.processPhotoToWebp(file.buffer);
    const key = `customer-docs/${deal.customerId}/${randomUUID()}.webp`;
    await this.storage.putObject(key, webp, 'image/webp');

    const doc = await this.prisma.customerDocument.create({
      data: {
        dealId: deal.id,
        customerId: deal.customerId,
        idType: meta.idType,
        capturedVia: meta.capturedVia,
        fileKey: key,
        status: 'pending',
      },
    });
    await this.audit.log({
      actorId: userId,
      action: 'document.uploaded',
      objectType: 'customer_document',
      objectId: doc.id,
      meta: { dealId: deal.id, idType: meta.idType, capturedVia: meta.capturedVia },
    });

    const action = deal.state === 'docs_rejected' ? 'resubmit_documents' : 'submit_documents';
    const updated = await this.dealState.transition(deal.id, action, userId);

    // §4: "Members with can_verify notified".
    const verifiers = await this.prisma.agencyMember.findMany({
      where: { agencyId: deal.listing.agencyId, active: true, canVerify: true },
      select: { userId: true },
      distinct: ['userId'],
    });
    await Promise.all(
      verifiers.map((v) =>
        this.notifications.recordInApp({
          userId: v.userId,
          template: 'docs_submitted',
          payload: { dealId: deal.id },
        }),
      ),
    );
    return { deal: updated, document: this.serialize(doc) };
  }

  // POST /deals/:id/documents/url — a short-lived presigned URL to VIEW the
  // ID (§9): the customer themself, can_verify members of the owning agency,
  // or the platform admin. EVERY issued URL writes an audit row (rule 5).
  async issueUrl(userId: string, dealId: string) {
    const deal = await this.loadDeal(dealId);
    const doc = await this.latestDocument(dealId);
    if (!doc) throw new NotFoundException('document_not_found');

    let viewer: 'customer' | 'verifier' | 'platform_admin';
    if (deal.customerId === userId) {
      viewer = 'customer';
    } else {
      const membership = await this.prisma.agencyMember.findFirst({
        where: { userId, active: true },
        orderBy: { createdAt: 'asc' },
      });
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      const isPlatformAdmin =
        user?.isPlatformAdmin || isAllowlistedAdmin(this.config, user?.email ?? null);
      if (isPlatformAdmin) {
        viewer = 'platform_admin';
      } else if (!membership || membership.agencyId !== deal.listing.agencyId) {
        throw new ForbiddenException('not_allowed');
      } else if (!membership.canVerify) {
        throw new ForbiddenException('can_verify_required');
      } else {
        viewer = 'verifier';
      }
    }

    const url = await this.storage.presignGet(doc.fileKey, DOCUMENT_URL_TTL_SECONDS);
    await this.audit.log({
      actorId: userId,
      action: 'document.url_issued',
      objectType: 'customer_document',
      objectId: doc.id,
      meta: { dealId, viewer, expiresInSeconds: DOCUMENT_URL_TTL_SECONDS },
    });
    return {
      url,
      expiresInSeconds: DOCUMENT_URL_TTL_SECONDS,
      idType: doc.idType,
      capturedVia: doc.capturedVia,
      status: doc.status,
    };
  }

  // POST /deals/:id/verify — requires can_verify on the OWNING agency
  // (rule 9). The decision is its own distinct audit action (rule 4), never
  // folded into anything else.
  async verify(ctx: AgencyContext, actorId: string, dealId: string, input: VerifyDealInput) {
    const deal = await this.loadDeal(dealId);
    if (deal.listing.agencyId !== ctx.agencyId) throw new ForbiddenException('not_your_agency');
    if (!ctx.canVerify) throw new ForbiddenException('can_verify_required');
    const doc = await this.latestDocument(dealId);
    if (!doc || doc.status !== 'pending') throw new BadRequestException('no_pending_document');

    const approved = input.decision === 'approve';
    const updated = await this.dealState.transition(
      deal.id,
      approved ? 'approve_documents' : 'reject_documents',
      actorId,
      input.note,
    );
    await this.prisma.customerDocument.update({
      where: { id: doc.id },
      data: {
        status: approved ? 'approved' : 'rejected',
        reviewedById: actorId,
        reviewedAt: new Date(),
        reviewNote: input.note,
      },
    });
    await this.audit.log({
      actorId,
      action: approved ? 'deal.verify_approved' : 'deal.verify_rejected',
      objectType: 'deal',
      objectId: deal.id,
      meta: { documentId: doc.id, note: input.note ?? null },
    });

    // §7: approved / rejected → customer + assigned agent (never email).
    const customerMsg = approved
      ? 'Guri: aqoonsigaagii waa la ansixiyay — waxaa xiga saxiixa heshiiska. — Guri: your ID was approved — signing is next.'
      : `Guri: aqoonsigaagii waa la diiday — ${input.note}. Mar kale sawir oo soo geli. — Guri: your ID was rejected — ${input.note}. Please re-capture and upload again.`;
    if (deal.customer.phone) {
      await this.notifications.sendSms({
        userId: deal.customer.id,
        phone: deal.customer.phone,
        template: approved ? 'verify_approved' : 'verify_rejected',
        message: customerMsg,
        payload: { dealId: deal.id },
      });
    } else {
      await this.notifications.recordInApp({
        userId: deal.customer.id,
        template: approved ? 'verify_approved' : 'verify_rejected',
        payload: { dealId: deal.id, note: input.note ?? null },
      });
    }
    if (deal.agentId) {
      await this.notifications.recordInApp({
        userId: deal.agentId,
        template: approved ? 'verify_approved' : 'verify_rejected',
        payload: { dealId: deal.id },
      });
    }
    return updated;
  }

  private serialize(doc: {
    id: string;
    idType: string;
    capturedVia: string;
    status: string;
    reviewNote: string | null;
    createdAt: Date;
  }) {
    return {
      id: doc.id,
      idType: doc.idType,
      capturedVia: doc.capturedVia,
      status: doc.status,
      reviewNote: doc.reviewNote,
      uploadedAt: doc.createdAt,
    };
  }
}
