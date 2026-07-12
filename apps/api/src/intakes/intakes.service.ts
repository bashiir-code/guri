import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  findIntakeTransition,
  INTAKE_TIMERS,
  type IntakeAction,
  type IntakeSubmitInput,
} from '@guri/shared';
import type { Intake, IntakeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  StorageService,
  PHOTO_URL_TTL_SECONDS,
  DOCUMENT_URL_TTL_SECONDS,
} from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ListingsService } from '../listings/listings.service';
import { AgencyContext } from '../auth/agency.guard';

const DAY = 86_400_000;

// The §15 owner-intake state machine and the operations around it. Mirrors the
// deal engine's discipline: EVERY status change goes through `transition()`,
// which validates against the shared INTAKE_TRANSITIONS table — jobs, owners,
// and agents are all just callers. THE LOAD-BEARING RULE (rule 6, §15): nothing
// here is ever public. An intake becomes visible only when an agency CONVERTS
// it into a listing and then publishes through the normal path.
@Injectable()
export class IntakesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly listings: ListingsService,
  ) {}

  // The ONLY writer of intakes.status. Validates the (from, action) pair against
  // the shared table before persisting the resulting status.
  private nextStatus(current: IntakeStatus | null, action: IntakeAction): IntakeStatus {
    const t = findIntakeTransition(current, action);
    if (!t) throw new BadRequestException(`invalid_intake_transition:${current}->${action}`);
    return t.to;
  }

  // ---------------- owner side ----------------

  // POST /intakes — owner submits a house and picks ONE active agency. Grants
  // the owner role implicitly: the /me resolver now sees this intake (rule 15,
  // no second account). Photos required; owner docs optional pre-screen material.
  async submit(
    userId: string,
    input: IntakeSubmitInput,
    files: { photos?: { buffer: Buffer }[]; docs?: { buffer: Buffer; mimetype?: string; originalname?: string }[] },
  ) {
    const agency = await this.prisma.agency.findUnique({ where: { id: input.agencyId } });
    if (!agency || agency.status !== 'active') throw new BadRequestException('agency_not_available');
    const photos = files.photos ?? [];
    if (photos.length === 0) throw new BadRequestException('no_photos');

    const photoKeys: string[] = [];
    for (const p of photos) {
      const webp = await this.storage.processPhotoToWebp(p.buffer); // rejects junk cleanly (§9)
      const key = `intake-photos/${userId}/${randomUUID()}.webp`;
      await this.storage.putObject(key, webp, 'image/webp');
      photoKeys.push(key);
    }
    const docKeys: string[] = [];
    for (const d of files.docs ?? []) {
      const ext = (d.originalname?.split('.').pop() ?? 'bin').toLowerCase().slice(0, 8);
      const key = `intake-docs/${userId}/${randomUUID()}.${ext}`;
      await this.storage.putObject(key, d.buffer, d.mimetype || 'application/octet-stream');
      docKeys.push(key);
    }

    this.nextStatus(null, 'submit'); // validate creation is a legal transition
    const intake = await this.prisma.intake.create({
      data: {
        ownerUserId: userId,
        agencyId: input.agencyId,
        district: input.district,
        neighborhood: input.neighborhood,
        type: input.type,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        expectedRentUsd: input.expectedRentUsd,
        photos: photoKeys,
        docs: docKeys,
        notes: input.notes,
        status: 'submitted',
      },
    });
    await this.audit.log({
      actorId: userId,
      action: 'intake.submitted',
      objectType: 'intake',
      objectId: intake.id,
      meta: { agencyId: input.agencyId, district: input.district },
    });
    await this.notifyAgencyNewLead(intake);
    return this.serializeForOwner(intake);
  }

  // GET /my/intakes — the owner's submissions + status. Accepted intakes carry
  // the agency's contact so the owner can arrange the meetup (§15).
  async myIntakes(userId: string) {
    const intakes = await this.prisma.intake.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: { agency: { select: { name: true, phone: true } } },
    });
    return Promise.all(intakes.map((i) => this.serializeForOwner(i, i.agency)));
  }

  // POST /intakes/:id/reassign — owner re-sends a declined/expired intake to a
  // different active agency. The tie is NOT permanent until conversion (§15).
  async reassign(userId: string, intakeId: string, newAgencyId: string) {
    const intake = await this.prisma.intake.findUnique({ where: { id: intakeId } });
    if (!intake || intake.ownerUserId !== userId) throw new NotFoundException('intake_not_found');
    const to = this.nextStatus(intake.status, 'reassign'); // only from declined|expired
    const agency = await this.prisma.agency.findUnique({ where: { id: newAgencyId } });
    if (!agency || agency.status !== 'active') throw new BadRequestException('agency_not_available');

    const updated = await this.prisma.intake.update({
      where: { id: intakeId },
      data: { agencyId: newAgencyId, status: to, declineReason: null },
      include: { agency: { select: { name: true, phone: true } } },
    });
    await this.audit.log({
      actorId: userId,
      action: 'intake.reassigned',
      objectType: 'intake',
      objectId: intakeId,
      meta: { toAgencyId: newAgencyId },
    });
    await this.notifyAgencyNewLead(updated);
    return this.serializeForOwner(updated, updated.agency);
  }

  // ---------------- agency side ----------------

  private async loadScoped(ctx: AgencyContext, intakeId: string): Promise<Intake> {
    const intake = await this.prisma.intake.findUnique({ where: { id: intakeId } });
    // Rule 3 + rule 6: an intake for another agency simply doesn't exist here.
    if (!intake || intake.agencyId !== ctx.agencyId) throw new NotFoundException('intake_not_found');
    return intake;
  }

  // GET /agency/intakes — the leads inbox: actionable leads (submitted first,
  // then accepted), each with owner contact, district, age, and photo URLs.
  async agencyIntakes(ctx: AgencyContext) {
    const intakes = await this.prisma.intake.findMany({
      where: { agencyId: ctx.agencyId, status: { in: ['submitted', 'accepted'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      include: { ownerUser: { select: { name: true, phone: true } } },
    });
    return Promise.all(intakes.map((i) => this.serializeForAgency(i)));
  }

  async accept(ctx: AgencyContext, actorId: string, intakeId: string) {
    const intake = await this.loadScoped(ctx, intakeId);
    const to = this.nextStatus(intake.status, 'accept');
    const updated = await this.prisma.intake.update({ where: { id: intakeId }, data: { status: to } });
    await this.audit.log({ actorId, action: 'intake.accepted', objectType: 'intake', objectId: intakeId });
    // Owner gets the agency's contact so they arrange the meetup themselves (§7).
    const agency = await this.prisma.agency.findUnique({ where: { id: ctx.agencyId } });
    await this.notifyOwner(intake, 'intake_accepted', {
      agencyName: agency?.name ?? '',
      agencyPhone: agency?.phone ?? '',
    });
    return this.serializeForAgency({ ...updated, ownerUser: null });
  }

  // Decline from `submitted`, or abandon from `accepted` — both land in
  // `declined` with a required reason, from which the owner may reassign (§15).
  async declineOrAbandon(ctx: AgencyContext, actorId: string, intakeId: string, reason: string) {
    const intake = await this.loadScoped(ctx, intakeId);
    const action: IntakeAction = intake.status === 'accepted' ? 'abandon' : 'decline';
    const to = this.nextStatus(intake.status, action);
    const updated = await this.prisma.intake.update({
      where: { id: intakeId },
      data: { status: to, declineReason: reason },
    });
    await this.audit.log({
      actorId,
      action: 'intake.declined',
      objectType: 'intake',
      objectId: intakeId,
      meta: { via: action, reason },
    });
    await this.notifyOwner(intake, 'intake_declined', { reason });
    return this.serializeForAgency({ ...updated, ownerUser: null });
  }

  // POST /intakes/:id/convert — the meetup happened. Link the owner to the
  // agency (PERMANENT from here on, §15/rule 6), create a DRAFT listing
  // prefilled from the intake, and mark the intake converted. Does NOT publish:
  // the agency completes owner docs + originals_verified and publishes through
  // the EXISTING path (§5) — the tie and every rule then apply unchanged.
  async convert(ctx: AgencyContext, actorId: string, intakeId: string) {
    const intake = await this.loadScoped(ctx, intakeId);
    const to = this.nextStatus(intake.status, 'convert'); // only from `accepted`

    // Owner link (permanent). Idempotent on (userId, agencyId).
    const owner = await this.prisma.owner.upsert({
      where: { userId_agencyId: { userId: intake.ownerUserId, agencyId: ctx.agencyId } },
      update: {},
      create: {
        userId: intake.ownerUserId,
        agencyId: ctx.agencyId,
        createdById: actorId,
        inviteStatus: 'claimed', // the owner self-submitted and is a real user
      },
    });

    // Draft listing prefilled from the intake; agency edits + verifies + publishes.
    const listing = await this.prisma.listing.create({
      data: {
        agencyId: ctx.agencyId,
        ownerId: owner.id,
        district: intake.district,
        neighborhood: intake.neighborhood,
        type: intake.type,
        bedrooms: intake.bedrooms,
        bathrooms: intake.bathrooms,
        rentUsd: intake.expectedRentUsd ?? 0,
        depositUsd: 0,
        descriptionSo: intake.notes ?? '',
        descriptionEn: '',
        photos: intake.photos, // reuse the keys the owner already uploaded
      },
    });

    const updated = await this.prisma.intake.update({
      where: { id: intakeId },
      data: { status: to, listingId: listing.id },
    });
    await this.audit.log({
      actorId,
      action: 'intake.converted',
      objectType: 'intake',
      objectId: intakeId,
      meta: { listingId: listing.id, ownerId: owner.id },
    });
    await this.audit.log({
      actorId,
      action: 'listing.created',
      objectType: 'listing',
      objectId: listing.id,
      meta: { fromIntake: intakeId },
    });

    // Hand back the (still-private) draft so the UI opens the §5 editor.
    return { intake: this.serializeForAgency({ ...updated, ownerUser: null }), listing: await this.listings.detail(ctx, listing.id) };
  }

  // ---------------- timer (called by the §8 runner) ----------------

  // §15 timer: submitted with no agency response in 5 days → expired; owner is
  // prompted to reassign. Goes through the state machine like every transition.
  async expireStaleSubmitted(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - INTAKE_TIMERS.submittedExpiresAfterDays * DAY);
    const stale = await this.prisma.intake.findMany({
      where: { status: 'submitted', createdAt: { lt: cutoff } },
    });
    for (const intake of stale) {
      const to = this.nextStatus(intake.status, 'expire');
      await this.prisma.intake.update({ where: { id: intake.id }, data: { status: to } });
      await this.audit.log({
        actorId: null,
        action: 'intake.expired',
        objectType: 'intake',
        objectId: intake.id,
      });
      await this.notifyOwner(intake, 'intake_expired', {}, `intake_expired:${intake.id}`);
    }
    return stale.length;
  }

  // ---------------- notifications ----------------

  private async notifyAgencyNewLead(intake: Intake) {
    const members = await this.prisma.agencyMember.findMany({
      where: { agencyId: intake.agencyId, active: true },
      include: { user: { select: { id: true, phone: true, locale: true } } },
      distinct: ['userId'],
    });
    for (const m of members) {
      await this.notifications.notify({
        userId: m.user.id,
        phone: m.user.phone,
        locale: m.user.locale,
        template: 'intake_new_lead',
        params: { district: intake.district },
        dedupeKey: `intake_new_lead:${intake.id}:${m.user.id}`,
      });
    }
  }

  private async notifyOwner(
    intake: Intake,
    template: string,
    params: Record<string, string>,
    dedupeKey?: string,
  ) {
    const owner = await this.prisma.user.findUnique({
      where: { id: intake.ownerUserId },
      select: { id: true, phone: true, locale: true },
    });
    if (!owner) return;
    await this.notifications.notify({
      userId: owner.id,
      phone: owner.phone,
      locale: owner.locale,
      template,
      params,
      dedupeKey,
    });
  }

  // ---------------- serializers ----------------

  private async coverUrls(keys: string[]) {
    return Promise.all(keys.map((k) => this.storage.presignGet(k, PHOTO_URL_TTL_SECONDS)));
  }

  private async serializeForOwner(
    intake: Intake,
    agency?: { name: string; phone: string } | null,
  ) {
    return {
      id: intake.id,
      status: intake.status,
      district: intake.district,
      neighborhood: intake.neighborhood,
      type: intake.type,
      bedrooms: intake.bedrooms,
      bathrooms: intake.bathrooms,
      expectedRentUsd: intake.expectedRentUsd ? Number(intake.expectedRentUsd) : null,
      notes: intake.notes,
      declineReason: intake.declineReason,
      listingId: intake.listingId,
      photos: await this.coverUrls(intake.photos),
      // Contact only surfaces once the agency accepts (§15).
      agency: agency
        ? {
            name: agency.name,
            phone: intake.status === 'accepted' ? agency.phone : null,
            waUrl:
              intake.status === 'accepted'
                ? `https://wa.me/${agency.phone.replace(/[^0-9]/g, '')}`
                : null,
          }
        : null,
      createdAt: intake.createdAt,
      updatedAt: intake.updatedAt,
    };
  }

  private async serializeForAgency(
    intake: Intake & { ownerUser?: { name: string | null; phone: string | null } | null },
  ) {
    return {
      id: intake.id,
      status: intake.status,
      district: intake.district,
      neighborhood: intake.neighborhood,
      type: intake.type,
      bedrooms: intake.bedrooms,
      bathrooms: intake.bathrooms,
      expectedRentUsd: intake.expectedRentUsd ? Number(intake.expectedRentUsd) : null,
      notes: intake.notes,
      listingId: intake.listingId,
      ownerName: intake.ownerUser?.name ?? null,
      ownerPhone: intake.ownerUser?.phone ?? null,
      ageDays: Math.floor((Date.now() - intake.createdAt.getTime()) / DAY),
      photos: await this.coverUrls(intake.photos),
      // Owner pre-screen docs: keys only here; served via presigned URL + audit
      // like any document (agency + admin only, NEVER public).
      docCount: intake.docs.length,
      createdAt: intake.createdAt,
    };
  }

  // POST /intakes/:id/docs/:index/url — presign an owner's pre-screen doc for
  // the OWNING agency only, audited (rule 5). Never public.
  async issueDocUrl(ctx: AgencyContext, actorId: string, intakeId: string, index: number) {
    const intake = await this.loadScoped(ctx, intakeId);
    const key = intake.docs[index];
    if (!key) throw new NotFoundException('document_not_found');
    const url = await this.storage.presignGet(key, DOCUMENT_URL_TTL_SECONDS);
    await this.audit.log({
      actorId,
      action: 'document.url_issued',
      objectType: 'intake_document',
      objectId: intakeId,
      meta: { index, expiresInSeconds: DOCUMENT_URL_TTL_SECONDS },
    });
    return { url, expiresInSeconds: DOCUMENT_URL_TTL_SECONDS };
  }
}
