import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { intakeDeclineSchema } from '@guri/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClerkAuthGuard, AuthenticatedRequest } from '../auth/clerk-auth.guard';
import { AgencyCtx, AgencyGuard, AgencyRoles, type AgencyContext } from '../auth/agency.guard';
import { RATE_LIMITS } from '../common/throttle';
import { IntakesService } from './intakes.service';

// Agency leads inbox (§15). Agency-scoped (rule 3): an intake for another agency
// is invisible here. Convert reuses the §5 publish path — it only creates the
// draft; the agency publishes through the normal endpoint.
@Controller()
@UseGuards(ClerkAuthGuard, AgencyGuard)
@AgencyRoles('agent')
export class AgencyIntakesController {
  constructor(private readonly intakes: IntakesService) {}

  @Get('agency/intakes')
  inbox(@AgencyCtx() ctx: AgencyContext) {
    return this.intakes.agencyIntakes(ctx);
  }

  @Post('intakes/:id/accept')
  accept(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.intakes.accept(ctx, req.user.sub, id);
  }

  @Post('intakes/:id/decline')
  decline(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(intakeDeclineSchema)) body: { reason: string },
  ) {
    return this.intakes.declineOrAbandon(ctx, req.user.sub, id, body.reason);
  }

  @Post('intakes/:id/convert')
  convert(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.intakes.convert(ctx, req.user.sub, id);
  }

  // Presign an owner's pre-screen doc for the owning agency, audited (rule 5).
  @Throttle({ default: RATE_LIMITS.documentUrl })
  @Post('intakes/:id/docs/:index/url')
  docUrl(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
  ) {
    return this.intakes.issueDocUrl(ctx, req.user.sub, id, index);
  }
}
