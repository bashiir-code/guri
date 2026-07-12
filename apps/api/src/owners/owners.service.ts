import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LEASE_LIVE_STATUSES, type CreateOwnerInput } from '@guri/shared';
import type { LeaseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AgencyContext } from '../auth/agency.guard';

const LEASE_LIVE = LEASE_LIVE_STATUSES as unknown as LeaseStatus[];

@Injectable()
export class OwnersService {
  private readonly webOrigin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.webOrigin = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
  }

  async create(ctx: AgencyContext, actorId: string, input: CreateOwnerInput) {
    const { owner, agencyName, user } = await this.prisma.$transaction(async (tx) => {
      // Identity keys off email (the Clerk credential, rule 13); phone is
      // contact data only. No email yet → a placeholder row the claim flow
      // (or a webhook email match) links to Clerk later.
      let u = input.email ? await tx.user.findUnique({ where: { email: input.email } }) : null;
      if (!u) {
        u = await tx.user.create({
          data: { name: input.name, phone: input.phone, email: input.email },
        });
      }
      const existing = await tx.owner.findUnique({
        where: { userId_agencyId: { userId: u.id, agencyId: ctx.agencyId } },
      });
      if (existing) throw new ConflictException('owner_already_exists');

      const created = await tx.owner.create({
        data: {
          userId: u.id,
          agencyId: ctx.agencyId,
          createdById: actorId,
          // Already signed in with Clerk before → nothing left to claim.
          inviteStatus: u.clerkUserId ? 'claimed' : 'invited',
        },
      });
      const agency = await tx.agency.findUniqueOrThrow({
        where: { id: ctx.agencyId },
        select: { name: true },
      });
      return { owner: created, agencyName: agency.name, user: u };
    });

    // Bilingual, channel-agnostic invite per §7 (adapter logs to console in
    // dev; SMS or WhatsApp in prod). Sign-in is Google or email via Clerk.
    await this.notifications.sendSms({
      userId: user.id,
      phone: input.phone,
      template: 'owner_invite',
      message:
        `${agencyName} ayaa kugu casuuntay Guri si aad u aragto gurigaaga iyo dakhligaaga. Ku gal Google ama email: ${this.webOrigin} — ` +
        `${agencyName} invited you to Guri to see your property and income. Sign in with Google or email: ${this.webOrigin}`,
      payload: { agencyId: ctx.agencyId, ownerId: owner.id },
    });

    return this.serialize(owner.id, ctx);
  }

  async list(ctx: AgencyContext) {
    const owners = await this.prisma.owner.findMany({
      where: { agencyId: ctx.agencyId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, phone: true, active: true } },
        _count: { select: { listings: true } },
      },
    });
    // Count each owner's live leases so the UI can enable/disable deactivation
    // exactly where the guard would allow it (§17).
    return Promise.all(
      owners.map(async (o) => ({
        id: o.id,
        name: o.user.name,
        phone: o.user.phone,
        inviteStatus: o.inviteStatus,
        listings: o._count.listings,
        active: o.user.active,
        liveLeases: await this.prisma.lease.count({
          where: { listing: { ownerId: o.id }, status: { in: LEASE_LIVE } },
        }),
        createdAt: o.createdAt,
      })),
    );
  }

  // §17: deactivate/reactivate an owner this agency created — a users.active
  // flip, never a delete (leases + income history point at the row). Deactivation
  // is blocked while any live lease ties the owner to a property (same guard as
  // leave-platform, §16). Reactivation also happens when the owner next signs in.
  async setActive(ctx: AgencyContext, actorId: string, ownerId: string, active: boolean) {
    const owner = await this.prisma.owner.findFirst({
      where: { id: ownerId, agencyId: ctx.agencyId },
      include: { user: { select: { id: true } } },
    });
    if (!owner) throw new NotFoundException('owner_not_found');

    if (!active) {
      const liveLeases = await this.prisma.lease.count({
        where: { listing: { ownerId: owner.id }, status: { in: LEASE_LIVE } },
      });
      if (liveLeases > 0) throw new ConflictException('owner_has_live_lease');
    }

    await this.prisma.user.update({
      where: { id: owner.userId },
      data: { active, deactivatedAt: active ? null : new Date() },
    });
    await this.audit.log({
      actorId,
      action: active ? 'owner.reactivated' : 'owner.deactivated',
      objectType: 'owner',
      objectId: owner.id,
      meta: { agencyId: ctx.agencyId, userId: owner.userId },
    });
    return this.serialize(owner.id, ctx);
  }

  private async serialize(ownerId: string, ctx: AgencyContext) {
    const o = await this.prisma.owner.findFirstOrThrow({
      where: { id: ownerId, agencyId: ctx.agencyId },
      include: { user: { select: { name: true, phone: true, active: true } } },
    });
    return {
      id: o.id,
      name: o.user.name,
      phone: o.user.phone,
      inviteStatus: o.inviteStatus,
      active: o.user.active,
      createdAt: o.createdAt,
    };
  }
}
