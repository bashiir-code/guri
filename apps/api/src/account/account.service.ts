import { ConflictException, Injectable } from '@nestjs/common';
import { DEAL_OPEN_STATES, LEASE_LIVE_STATUSES } from '@guri/shared';
import type { DealState, LeaseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DealStateService } from '../deals/deal-state.service';

const LEASE_LIVE = LEASE_LIVE_STATUSES as unknown as LeaseStatus[];
const OPEN = DEAL_OPEN_STATES as unknown as DealState[];

// Leave-platform (§16 / rule 8). Blocked while ANY live lease ties the user
// to the platform — as tenant, as owner of a rented property, or as staff of
// an agency with a live lease. Otherwise the account is deactivated: profile
// hidden, open requests withdrawn, personal data scheduled for deletion.
// Reactivation = signing in again (the same Clerk account).
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dealState: DealStateService,
  ) {}

  async leave(userId: string): Promise<{ ok: true }> {
    const [asTenant, asOwner, asAgency] = await Promise.all([
      this.prisma.lease.count({ where: { customerId: userId, status: { in: LEASE_LIVE } } }),
      this.prisma.lease.count({
        where: { listing: { owner: { userId } }, status: { in: LEASE_LIVE } },
      }),
      this.prisma.lease.count({
        where: {
          status: { in: LEASE_LIVE },
          listing: { agency: { members: { some: { userId, active: true } } } },
        },
      }),
    ]);
    if (asTenant > 0) throw new ConflictException('live_lease_tenant');
    if (asOwner > 0) throw new ConflictException('live_lease_owner');
    if (asAgency > 0) throw new ConflictException('live_lease_agency');

    // withdraw open requests through the state machine (rule 2)
    const open = await this.prisma.deal.findMany({
      where: { customerId: userId, state: { in: OPEN } },
      select: { id: true },
    });
    for (const d of open) {
      await this.dealState.transition(d.id, 'withdraw', userId, 'left_platform');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { active: false, deactivatedAt: new Date() },
    });
    return { ok: true };
  }
}
