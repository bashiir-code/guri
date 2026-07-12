import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import {
  endLeaseSchema,
  logPaymentSchema,
  renewLeaseSchema,
  type EndLeaseInput,
  type LogPaymentInput,
  type RenewLeaseInput,
} from '@guri/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClerkAuthGuard, AuthenticatedRequest } from '../auth/clerk-auth.guard';
import { AgencyCtx, AgencyGuard, AgencyRoles, type AgencyContext } from '../auth/agency.guard';
import { LeasesService } from './leases.service';
import { DealStateService } from '../deals/deal-state.service';

@Controller()
@UseGuards(ClerkAuthGuard, AgencyGuard)
@AgencyRoles('agent')
export class LeasesController {
  constructor(
    private readonly leases: LeasesService,
    private readonly dealState: DealStateService,
  ) {}

  @Post('leases/:id/payments')
  logPayment(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(logPaymentSchema)) body: LogPaymentInput,
  ) {
    return this.leases.logPayment(ctx, req.user.sub, id, body);
  }

  // §16 human actions — through the state machine (rule 2).
  @Post('leases/:id/renew')
  renew(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(renewLeaseSchema)) body: RenewLeaseInput,
  ) {
    return this.dealState.renewLease(ctx, req.user.sub, id, body);
  }

  @Post('leases/:id/end')
  end(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(endLeaseSchema)) body: EndLeaseInput,
  ) {
    return this.dealState.endLease(ctx, req.user.sub, id, body);
  }

  @Get('agency/tenancies')
  tenancies(@AgencyCtx() ctx: AgencyContext) {
    return this.leases.tenancies(ctx);
  }
}
