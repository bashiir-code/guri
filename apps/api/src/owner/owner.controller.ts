import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard, AuthenticatedRequest } from '../auth/clerk-auth.guard';
import { OwnerCtx, OwnerGuard, type OwnerContext } from './owner.guard';
import { OwnerService } from './owner.service';

// §6 owner endpoints — ALL reads. The only write an owner has anywhere is
// PATCH /me (their own profile).
@Controller('owner')
@UseGuards(ClerkAuthGuard, OwnerGuard)
export class OwnerController {
  constructor(private readonly owner: OwnerService) {}

  @Get('dashboard')
  dashboard(@Req() req: AuthenticatedRequest, @OwnerCtx() ctx: OwnerContext) {
    return this.owner.dashboard(ctx, req.user.sub);
  }

  @Get('properties')
  properties(@OwnerCtx() ctx: OwnerContext) {
    return this.owner.properties(ctx);
  }

  @Get('properties/:id')
  propertyDetail(@OwnerCtx() ctx: OwnerContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.owner.propertyDetail(ctx, id);
  }

  @Get('payments')
  payments(
    @OwnerCtx() ctx: OwnerContext,
    @Query('listingId') listingId?: string,
    @Query('month') month?: string,
  ) {
    return this.owner.payments(ctx, { listingId, month });
  }
}
