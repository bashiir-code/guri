import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import {
  addStaffSchema,
  patchStaffSchema,
  type AddStaffInput,
  type PatchStaffInput,
} from '@guri/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClerkAuthGuard, AuthenticatedRequest } from '../auth/clerk-auth.guard';
import { AgencyCtx, AgencyGuard, AgencyRoles, type AgencyContext } from '../auth/agency.guard';
import { StaffService } from './staff.service';

// Admin only (§5 staff screen).
@Controller('agency/staff')
@UseGuards(ClerkAuthGuard, AgencyGuard)
@AgencyRoles('admin')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(@AgencyCtx() ctx: AgencyContext) {
    return this.staff.list(ctx);
  }

  @Post()
  addAgent(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Body(new ZodValidationPipe(addStaffSchema)) body: AddStaffInput,
  ) {
    return this.staff.addAgent(ctx, req.user.sub, body);
  }

  @Patch(':userId')
  patch(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(patchStaffSchema)) body: PatchStaffInput,
  ) {
    return this.staff.patch(ctx, req.user.sub, userId, body);
  }
}
