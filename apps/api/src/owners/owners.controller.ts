import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  createOwnerSchema,
  patchOwnerSchema,
  type CreateOwnerInput,
  type PatchOwnerInput,
} from '@guri/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClerkAuthGuard, AuthenticatedRequest } from '../auth/clerk-auth.guard';
import { AgencyCtx, AgencyGuard, AgencyRoles, type AgencyContext } from '../auth/agency.guard';
import { OwnersService } from './owners.service';

@Controller('owners')
@UseGuards(ClerkAuthGuard, AgencyGuard)
@AgencyRoles('agent')
export class OwnersController {
  constructor(private readonly owners: OwnersService) {}

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Body(new ZodValidationPipe(createOwnerSchema)) body: CreateOwnerInput,
  ) {
    return this.owners.create(ctx, req.user.sub, body);
  }

  @Get()
  list(@AgencyCtx() ctx: AgencyContext) {
    return this.owners.list(ctx);
  }

  // §17: deactivate/reactivate an owner this agency created (never delete).
  @Patch(':id')
  setActive(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(patchOwnerSchema)) body: PatchOwnerInput,
  ) {
    return this.owners.setActive(ctx, req.user.sub, id, body.active);
  }
}
