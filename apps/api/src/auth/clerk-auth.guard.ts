import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ClerkVerifierService } from './clerk-verifier.service';

export interface RequestUser {
  /** local users.id — what every foreign key and audit row points at */
  sub: string;
  clerkUserId: string;
}

export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}

// Verifies the Clerk session JWT and resolves it to the LOCAL users row
// (rule 13: identity must exist in our Postgres, not only in Clerk's cloud).
// The app never mints tokens — Clerk owns sessions entirely.
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: ClerkVerifierService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing_token');
    }
    const payload = await this.verifier.verify(header.slice('Bearer '.length));

    let user = await this.prisma.user.findUnique({ where: { clerkUserId: payload.sub } });
    if (!user) {
      // The webhook normally mirrors first; this covers the race right after
      // signup. Link to an agency-provisioned row by email when possible.
      const byEmail = payload.email
        ? await this.prisma.user.findUnique({ where: { email: payload.email } })
        : null;
      if (byEmail && !byEmail.clerkUserId) {
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { clerkUserId: payload.sub },
        });
        // linking claims any pending owner invites (rule 15: one account)
        await this.prisma.owner.updateMany({
          where: { userId: byEmail.id, inviteStatus: 'invited' },
          data: { inviteStatus: 'claimed' },
        });
      } else {
        user = await this.prisma.user.create({
          data: { clerkUserId: payload.sub, email: byEmail ? undefined : payload.email },
        });
      }
    }
    // §16: a user who left the platform reactivates simply by signing in
    // again (same Clerk account). A fresh authenticated session is that
    // signal, so we clear the deactivation.
    if (!user.active) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { active: true, deactivatedAt: null },
      });
    }

    request.user = { sub: user.id, clerkUserId: payload.sub };
    return true;
  }
}
