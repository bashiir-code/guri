import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

export interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    primary_email_address_id?: string | null;
    email_addresses?: ClerkEmailAddress[];
  };
}

// Mirrors Clerk users into the local users table (rule 13): deals, leases,
// agency_members and audit_log all hold real foreign keys to users.id, so
// identity must exist in OUR Postgres. Deletions deactivate — never delete —
// to keep the audit trail intact.
@Injectable()
export class ClerkSyncService {
  private readonly logger = new Logger(ClerkSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processEvent(event: ClerkWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'user.created':
      case 'user.updated':
        await this.upsertUser(event.data);
        return;
      case 'user.deleted':
        await this.prisma.user.updateMany({
          where: { clerkUserId: event.data.id },
          data: { active: false },
        });
        return;
      default:
        this.logger.debug(`ignoring clerk event ${event.type}`);
    }
  }

  private primaryEmail(data: ClerkWebhookEvent['data']): string | null {
    const list = data.email_addresses ?? [];
    const primary = list.find((e) => e.id === data.primary_email_address_id) ?? list[0];
    return primary ? primary.email_address.toLowerCase() : null;
  }

  private async upsertUser(data: ClerkWebhookEvent['data']): Promise<void> {
    const email = this.primaryEmail(data);
    const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim() || null;

    const existing = await this.prisma.user.findUnique({ where: { clerkUserId: data.id } });
    if (existing) {
      await this.prisma.user
        .update({
          where: { id: existing.id },
          data: { email: email ?? existing.email, name: name ?? existing.name, active: true },
        })
        .catch(() => {
          // email uniqueness clash with another row — keep the old email
          this.logger.warn(`email conflict updating user ${existing.id}`);
        });
      return;
    }

    // First sighting: link to an agency-provisioned row (owner invite, staff
    // add) that shares the email, instead of creating a duplicate identity.
    const byEmail = email ? await this.prisma.user.findUnique({ where: { email } }) : null;
    if (byEmail && !byEmail.clerkUserId) {
      await this.prisma.user.update({
        where: { id: byEmail.id },
        data: { clerkUserId: data.id, name: byEmail.name ?? name, active: true },
      });
      // The claim (§5 owner screen 1): linking completes any pending owner
      // invites — one account for every role, never a second (rule 15).
      await this.prisma.owner.updateMany({
        where: { userId: byEmail.id, inviteStatus: 'invited' },
        data: { inviteStatus: 'claimed' },
      });
      return;
    }

    await this.prisma.user.create({
      data: { clerkUserId: data.id, email: byEmail ? null : email, name },
    });
  }
}
