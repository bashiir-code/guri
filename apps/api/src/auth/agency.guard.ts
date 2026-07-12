import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AgencyRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest } from './clerk-auth.guard';

export interface AgencyContext {
  agencyId: string;
  roles: AgencyRole[];
  /** may approve/reject document sets on this agency's deals (rule 9) */
  canVerify: boolean;
}

export interface AgencyRequest extends AuthenticatedRequest {
  agency: AgencyContext;
}

const AGENCY_ROLES_KEY = 'agency_roles';

// Declares which agency role an endpoint needs. Admin implicitly passes every
// role requirement (§2: "everything an agent and verifier can do").
export const AgencyRoles = (...roles: AgencyRole[]) => SetMetadata(AGENCY_ROLES_KEY, roles);

// Injects the resolved AgencyContext into a handler parameter.
export const AgencyCtx = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AgencyRequest>().agency;
});

// CLAUDE.md rule 3: every agency-scoped endpoint goes through this guard, and
// services must filter every query by ctx.agencyId — never trust ids alone.
@Injectable()
export class AgencyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AgencyRequest>();
    const memberships = await this.prisma.agencyMember.findMany({
      where: { userId: request.user.sub, active: true },
      include: { agency: { select: { status: true } } },
    });
    const usable = memberships.filter((m) => m.agency.status === 'active');
    if (usable.length === 0) {
      throw new ForbiddenException('not_agency_staff');
    }

    // Staff of several agencies pick one via header; default is their first.
    const requested = request.headers['x-agency-id'];
    const agencyId =
      typeof requested === 'string' && usable.some((m) => m.agencyId === requested)
        ? requested
        : usable[0].agencyId;

    const agencyRows = usable.filter((m) => m.agencyId === agencyId);
    const roles = agencyRows.map((m) => m.role);
    const canVerify = agencyRows.some((m) => m.canVerify);
    const required =
      this.reflector.getAllAndOverride<AgencyRole[]>(AGENCY_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const allowed =
      required.length === 0 ||
      roles.includes('admin') ||
      required.some((r) => roles.includes(r));
    if (!allowed) {
      throw new ForbiddenException('insufficient_agency_role');
    }

    request.agency = { agencyId, roles, canVerify };
    return true;
  }
}
