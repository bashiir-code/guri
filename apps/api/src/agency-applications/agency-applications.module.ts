import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { AgencyApplicationsService } from './agency-applications.service';
import { PublicAgencyApplicationsController } from './public-agency-applications.controller';
import { AdminAgencyApplicationsController } from './admin-agency-applications.controller';

// §2/§15 agency onboarding leads. AdminModule provides createAgency, which an
// approval reuses so an approved application becomes a real agency + admin
// member through the one tested path (no forked provisioning logic).
@Module({
  imports: [AuthModule, AdminModule],
  controllers: [PublicAgencyApplicationsController, AdminAgencyApplicationsController],
  providers: [AgencyApplicationsService],
})
export class AgencyApplicationsModule {}
