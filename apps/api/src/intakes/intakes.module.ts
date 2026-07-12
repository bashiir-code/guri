import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ListingsModule } from '../listings/listings.module';
import { IntakesService } from './intakes.service';
import { AgenciesDirectoryService } from './agencies-directory.service';
import { PublicAgenciesController } from './public-agencies.controller';
import { OwnerIntakesController } from './owner-intakes.controller';
import { AgencyIntakesController } from './agency-intakes.controller';

// Owner-initiated intake (§15, phase 10). ListingsModule provides the publish
// path convert hands off to — conversion does NOT fork it (rule 6).
@Module({
  imports: [AuthModule, ListingsModule],
  controllers: [PublicAgenciesController, OwnerIntakesController, AgencyIntakesController],
  providers: [IntakesService, AgenciesDirectoryService],
  exports: [IntakesService],
})
export class IntakesModule {}
