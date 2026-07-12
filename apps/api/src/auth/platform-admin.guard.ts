import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest } from './clerk-auth.guard';
import { isAllowlistedAdmin } from './platform-admins';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { isPlatformAdmin: true, email: true },
    });
    const allowed =
      user?.isPlatformAdmin === true || isAllowlistedAdmin(this.config, user?.email ?? null);
    if (!allowed) {
      throw new ForbiddenException('not_platform_admin');
    }
    return true;
  }
}
