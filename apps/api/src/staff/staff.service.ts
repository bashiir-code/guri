import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DEAL_OPEN_STATES, type AddStaffInput, type PatchStaffInput } from '@guri/shared';
import type { DealState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AgencyContext } from '../auth/agency.guard';

const OPEN = DEAL_OPEN_STATES as unknown as DealState[];

// Staff are role rows in agency_members (§2/§3): one row per role. The UI's
// can_verify toggle maps to the presence of an active `verifier` row, keeping
// the §3 schema intact.
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(ctx: AgencyContext) {
    const members = await this.prisma.agencyMember.findMany({
      where: { agencyId: ctx.agencyId },
      include: { user: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const byUser = new Map<string, (typeof members)[number][]>();
    for (const m of members) {
      const rows = byUser.get(m.userId) ?? [];
      rows.push(m);
      byUser.set(m.userId, rows);
    }
    return Array.from(byUser.entries()).map(([userId, rows]) => ({
      userId,
      name: rows[0].user.name,
      phone: rows[0].user.phone,
      roles: rows.filter((r) => r.active).map((r) => r.role),
      isAdmin: rows.some((r) => r.role === 'admin' && r.active),
      // v1.10: a permission flag, not a role (rule 9)
      canVerify: rows.some((r) => r.canVerify && r.active),
      active: rows.some((r) => r.active),
    }));
  }

  async addAgent(ctx: AgencyContext, actorId: string, input: AddStaffInput) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Agents sign in with Clerk, so email is the identity key; the webhook
      // links their first Google/email sign-in to this row (rule 13).
      let user = await tx.user.findUnique({ where: { email: input.email } });
      if (!user) {
        user = await tx.user.create({
          data: { email: input.email, name: input.name, phone: input.phone },
        });
      }
      const existing = await tx.agencyMember.findUnique({
        where: {
          userId_agencyId_role: { userId: user.id, agencyId: ctx.agencyId, role: 'agent' },
        },
      });
      if (existing?.active) throw new ConflictException('already_staff');
      if (existing) {
        return tx.agencyMember.update({ where: { id: existing.id }, data: { active: true } });
      }
      return tx.agencyMember.create({
        data: { userId: user.id, agencyId: ctx.agencyId, role: 'agent' },
      });
    });
    await this.audit.log({
      actorId,
      action: 'staff.agent_added',
      objectType: 'agency_member',
      objectId: result.id,
      meta: { email: input.email },
    });
    return this.list(ctx);
  }

  // §17 worker removal = deactivate the membership (never destroy). Enforced at
  // the guard, which already rejects inactive memberships on the next request;
  // here we add the guard-rails so removal never leaves an agency headless or a
  // deal orphaned, and we record who did what to whom.
  async patch(ctx: AgencyContext, actorId: string, userId: string, input: PatchStaffInput) {
    const rows = await this.prisma.agencyMember.findMany({
      where: { agencyId: ctx.agencyId, userId },
    });
    if (rows.length === 0) throw new NotFoundException('staff_not_found');

    if (input.active === false) {
      await this.assertNotLastAdmin(ctx.agencyId, userId, rows);
      await this.reassignLiveDeals(ctx.agencyId, actorId, userId);
    }

    await this.prisma.agencyMember.updateMany({
      where: { agencyId: ctx.agencyId, userId },
      data: {
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.canVerify !== undefined ? { canVerify: input.canVerify } : {}),
      },
    });

    // Distinct actions so the audit trail (§9/§17) reads "who deactivated whom".
    const action =
      input.active === false
        ? 'staff.deactivated'
        : input.active === true
          ? 'staff.reactivated'
          : 'staff.updated';
    await this.audit.log({
      actorId,
      action,
      objectType: 'user',
      objectId: userId,
      meta: { agencyId: ctx.agencyId, ...input },
    });
    return this.list(ctx);
  }

  // §17: an agency must never become headless — block deactivating its last
  // active admin.
  private async assertNotLastAdmin(
    agencyId: string,
    userId: string,
    rows: { role: string; active: boolean }[],
  ): Promise<void> {
    const isActiveAdmin = rows.some((r) => r.role === 'admin' && r.active);
    if (!isActiveAdmin) return;
    const otherActiveAdmins = await this.prisma.agencyMember.findMany({
      where: { agencyId, role: 'admin', active: true, userId: { not: userId } },
      distinct: ['userId'],
      select: { userId: true },
    });
    if (otherActiveAdmins.length === 0) throw new ConflictException('last_active_admin');
  }

  // §17: a deactivated agent's live deals must never be orphaned — hand them to
  // another active member (prefer an agent; the head/admin is the fallback,
  // which is the "flag for the head" case), and tell the new owner.
  private async reassignLiveDeals(agencyId: string, actorId: string, userId: string): Promise<void> {
    const liveDeals = await this.prisma.deal.findMany({
      where: { agentId: userId, state: { in: OPEN }, listing: { agencyId } },
      select: { id: true },
    });
    if (liveDeals.length === 0) return;

    const pickActive = (role: 'agent' | 'admin') =>
      this.prisma.agencyMember.findFirst({
        where: { agencyId, role, active: true, userId: { not: userId } },
        select: { userId: true },
      });
    const replacement = (await pickActive('agent')) ?? (await pickActive('admin'));

    const dealIds = liveDeals.map((d) => d.id);
    await this.prisma.deal.updateMany({
      where: { id: { in: dealIds } },
      // A replacement always exists (the last-admin guard guarantees ≥1 active
      // admin remains); the `null` branch is a defensive flag-for-the-head.
      data: { agentId: replacement?.userId ?? null },
    });
    await this.audit.log({
      actorId,
      action: replacement ? 'deals.reassigned' : 'deals.flagged_for_head',
      objectType: 'user',
      objectId: userId,
      meta: { agencyId, toAgent: replacement?.userId ?? null, count: dealIds.length },
    });
    if (replacement) {
      await this.notifications.recordInApp({
        userId: replacement.userId,
        template: 'deals_reassigned',
        payload: { count: dealIds.length },
      });
    }
  }
}
