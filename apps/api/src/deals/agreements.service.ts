import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { GenerateAgreementInput } from '@guri/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService, DOCUMENT_URL_TTL_SECONDS } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { isAllowlistedAdmin } from '../auth/platform-admins';
import { AgencyContext } from '../auth/agency.guard';
import { renderAgreementPdf } from './agreement-pdf';

// The bilingual agreement (§6): generated at 'approved', physically signed,
// the scan uploaded — all prerequisites of the atomic close. Files live in
// the encrypted bucket and are served only via short-lived presigned URLs,
// one audit row per issue (§9).
@Injectable()
export class AgreementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private async findAgencyDeal(ctx: AgencyContext, dealId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, listing: { agencyId: ctx.agencyId } },
      include: {
        listing: {
          include: {
            agency: { select: { name: true, phone: true } },
            owner: { include: { user: { select: { name: true } } } },
          },
        },
        customer: { select: { name: true, phone: true } },
      },
    });
    if (!deal) throw new NotFoundException('deal_not_found');
    return deal;
  }

  async generate(ctx: AgencyContext, actorId: string, dealId: string, input: GenerateAgreementInput) {
    const deal = await this.findAgencyDeal(ctx, dealId);
    if (deal.state !== 'approved') throw new BadRequestException('deal_not_approved');

    const pdf = await renderAgreementPdf({
      agencyName: deal.listing.agency.name,
      agencyPhone: deal.listing.agency.phone,
      customerName: deal.customer.name ?? '—',
      customerPhone: deal.customer.phone ?? '—',
      ownerName: deal.listing.owner.user.name ?? '—',
      district: deal.listing.district,
      neighborhood: deal.listing.neighborhood,
      type: deal.listing.type,
      bedrooms: deal.listing.bedrooms,
      rentUsd: Number(deal.listing.rentUsd),
      depositUsd: Number(deal.listing.depositUsd),
      startDate: input.startDate ?? null,
      termMonths: input.termMonths ?? null,
      generatedAt: new Date(),
    });
    const key = `agreements/${dealId}/agreement-${randomUUID()}.pdf`;
    await this.storage.putObject(key, pdf, 'application/pdf');

    // Regenerating invalidates any earlier signed scan — the paper must match.
    const agreement = await this.prisma.agreement.upsert({
      where: { dealId },
      create: { dealId, pdfKey: key, generatedAt: new Date() },
      update: { pdfKey: key, generatedAt: new Date(), signedScanKey: null, signedAt: null },
    });
    await this.audit.log({
      actorId,
      action: 'agreement.generated',
      objectType: 'agreement',
      objectId: agreement.id,
      meta: { dealId, termMonths: input.termMonths ?? null },
    });
    return this.serialize(agreement);
  }

  async uploadSigned(
    ctx: AgencyContext,
    actorId: string,
    dealId: string,
    file: { buffer: Buffer; mimetype: string },
  ) {
    await this.findAgencyDeal(ctx, dealId);
    const agreement = await this.prisma.agreement.findUnique({ where: { dealId } });
    if (!agreement) throw new BadRequestException('agreement_not_generated');

    const ext = file.mimetype === 'application/pdf' ? 'pdf' : 'webp';
    const body =
      ext === 'webp' ? await this.storage.processPhotoToWebp(file.buffer) : file.buffer;
    const key = `agreements/${dealId}/signed-${randomUUID()}.${ext}`;
    await this.storage.putObject(key, body, ext === 'pdf' ? 'application/pdf' : 'image/webp');

    const updated = await this.prisma.agreement.update({
      where: { dealId },
      data: { signedScanKey: key, signedAt: new Date() },
    });
    await this.audit.log({
      actorId,
      action: 'agreement.signed_uploaded',
      objectType: 'agreement',
      objectId: agreement.id,
      meta: { dealId },
    });
    return this.serialize(updated);
  }

  // GET /deals/:id/agreement — parties only: the deal's customer, the owning
  // agency's members, the platform admin (§6/§9).
  async issueUrls(userId: string, dealId: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: { listing: { select: { agencyId: true } } },
    });
    if (!deal) throw new NotFoundException('deal_not_found');

    const isCustomer = deal.customerId === userId;
    if (!isCustomer) {
      const membership = await this.prisma.agencyMember.findFirst({
        where: { userId, agencyId: deal.listing.agencyId, active: true },
      });
      if (!membership) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        const isPlatformAdmin =
          user?.isPlatformAdmin || isAllowlistedAdmin(this.config, user?.email ?? null);
        if (!isPlatformAdmin) throw new ForbiddenException('not_a_party');
      }
    }

    const agreement = await this.prisma.agreement.findUnique({ where: { dealId } });
    if (!agreement) throw new NotFoundException('agreement_not_found');

    const pdfUrl = await this.storage.presignGet(agreement.pdfKey, DOCUMENT_URL_TTL_SECONDS);
    await this.audit.log({
      actorId: userId,
      action: 'agreement.url_issued',
      objectType: 'agreement',
      objectId: agreement.id,
      meta: { dealId, part: 'pdf', expiresInSeconds: DOCUMENT_URL_TTL_SECONDS },
    });

    let signedUrl: string | null = null;
    if (agreement.signedScanKey) {
      signedUrl = await this.storage.presignGet(agreement.signedScanKey, DOCUMENT_URL_TTL_SECONDS);
      await this.audit.log({
        actorId: userId,
        action: 'agreement.url_issued',
        objectType: 'agreement',
        objectId: agreement.id,
        meta: { dealId, part: 'signed_scan', expiresInSeconds: DOCUMENT_URL_TTL_SECONDS },
      });
    }
    return { pdfUrl, signedUrl, expiresInSeconds: DOCUMENT_URL_TTL_SECONDS };
  }

  private serialize(a: {
    id: string;
    dealId: string;
    generatedAt: Date;
    signedAt: Date | null;
    signedScanKey: string | null;
  }) {
    return {
      id: a.id,
      dealId: a.dealId,
      generatedAt: a.generatedAt,
      signedAt: a.signedAt,
      hasSignedScan: a.signedScanKey !== null,
    };
  }
}
