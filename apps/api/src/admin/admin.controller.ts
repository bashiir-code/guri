import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import {
  createAgencySchema,
  patchAgencySchema,
  type CreateAgencyInput,
  type PatchAgencyInput,
} from '@guri/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClerkAuthGuard, AuthenticatedRequest } from '../auth/clerk-auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { AdminService } from './admin.service';

@Controller('admin/agencies')
@UseGuards(ClerkAuthGuard, PlatformAdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post()
  createAgency(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createAgencySchema)) body: CreateAgencyInput,
  ) {
    return this.admin.createAgency(req.user.sub, body);
  }

  @Get()
  listAgencies() {
    return this.admin.listAgencies();
  }

  @Patch(':id')
  patchAgency(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(patchAgencySchema)) body: PatchAgencyInput,
  ) {
    return this.admin.patchAgency(req.user.sub, id, body);
  }
}

// §5/§9 oversight: audit any deal, read platform metrics. Read-only — the
// platform admin never edits listings or acts on deals (§2).
@Controller('admin')
@UseGuards(ClerkAuthGuard, PlatformAdminGuard)
export class AdminOversightController {
  constructor(private readonly admin: AdminService) {}

  @Get('deals/recent')
  recentDeals() {
    return this.admin.recentDeals();
  }

  @Get('deals/:id/audit')
  dealAudit(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.dealAudit(id);
  }

  @Get('metrics')
  metrics() {
    return this.admin.metrics();
  }
}
