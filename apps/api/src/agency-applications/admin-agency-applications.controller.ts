import { Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard, AuthenticatedRequest } from '../auth/clerk-auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { AgencyApplicationsService } from './agency-applications.service';

// Platform-admin waiting list for agency applications (§2/§15). Read the queue,
// then approve (provisions the real agency) or decline. Guarded exactly like
// the rest of the admin surface.
@Controller('admin/agency-applications')
@UseGuards(ClerkAuthGuard, PlatformAdminGuard)
export class AdminAgencyApplicationsController {
  constructor(private readonly applications: AgencyApplicationsService) {}

  @Get()
  list() {
    return this.applications.listPending();
  }

  @Post(':id/approve')
  approve(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.approve(req.user.sub, id);
  }

  @Post(':id/decline')
  decline(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.decline(req.user.sub, id);
  }
}
