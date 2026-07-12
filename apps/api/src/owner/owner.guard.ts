import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest } from '../auth/clerk-auth.guard';

export interface OwnerContext {
  /** owners.id rows belonging to this user (one per agency relationship) */
  ownerIds: string[];
}

export interface OwnerRequest extends AuthenticatedRequest {
  owner: OwnerContext;
}

export const OwnerCtx = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<OwnerRequest>().owner;
});

// Rule 3: owners see only their own properties. Everything under /owner/* is
// filtered by these owner ids — and it is all STRICTLY read-only (§2: the
// agency is the single source of truth for listings).
@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OwnerRequest>();
    const rows = await this.prisma.owner.findMany({
      where: { userId: request.user.sub },
      select: { id: true },
    });
    if (rows.length === 0) throw new ForbiddenException('not_an_owner');
    request.owner = { ownerIds: rows.map((r) => r.id) };
    return true;
  }
}
