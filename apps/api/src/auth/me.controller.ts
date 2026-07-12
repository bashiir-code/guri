import { Body, Controller, Get, NotFoundException, Patch, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { profileUpdateSchema, type ProfileUpdateInput } from '@guri/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClerkAuthGuard, AuthenticatedRequest } from './clerk-auth.guard';
import { isAllowlistedAdmin } from './platform-admins';

// /me resolves the Clerk session to the LOCAL user row. Roles per §2:
// everyone is a customer; owner/agency roles come from owners and
// agency_members rows; platform admin from users.is_platform_admin.
// PATCH /me is post-signup onboarding: name + contact phone (never verified).
@Controller('me')
@UseGuards(ClerkAuthGuard)
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  me(@Req() req: AuthenticatedRequest) {
    return this.serialize(req.user.sub);
  }

  @Patch()
  async update(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(profileUpdateSchema)) body: ProfileUpdateInput,
  ) {
    await this.prisma.user.update({
      where: { id: req.user.sub },
      data: { name: body.name, phone: body.phone, locale: body.locale },
    });
    return this.serialize(req.user.sub);
  }

  private async serialize(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        agencyMemberships: {
          where: { active: true },
          select: { agencyId: true, role: true, canVerify: true },
        },
        ownerProfiles: { select: { agencyId: true } },
        // Rule 15 (§15): submitting an intake makes you an owner — no second
        // account, no premature agency tie. The owner role shows as soon as
        // there's an intake, before any owners row exists (that's created only
        // at conversion). One row is enough to flip the role.
        intakes: { select: { id: true }, take: 1 },
      },
    });
    if (!user) throw new NotFoundException('user_not_found');
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      locale: user.locale,
      roles: {
        customer: true,
        owner: user.ownerProfiles.length > 0 || user.intakes.length > 0,
        agencyMemberships: user.agencyMemberships,
        // §2 v1.10: seeded from the env allowlist (or the DB grant) — never
        // self-serve, never client-declared.
        platformAdmin:
          user.isPlatformAdmin || isAllowlistedAdmin(this.config, user.email),
      },
    };
  }
}
