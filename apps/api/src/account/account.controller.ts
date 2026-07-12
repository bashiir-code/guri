import { Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard, AuthenticatedRequest } from '../auth/clerk-auth.guard';
import { AccountService } from './account.service';
import { RATE_LIMITS } from '../common/throttle';

@Controller('me')
@UseGuards(ClerkAuthGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  // §16 leave-platform. 409 with a reason while a live lease exists.
  @Throttle({ default: RATE_LIMITS.leave })
  @Post('leave')
  @HttpCode(200)
  leave(@Req() req: AuthenticatedRequest) {
    return this.account.leave(req.user.sub);
  }
}
