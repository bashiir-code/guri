import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DealsModule } from '../deals/deals.module';
import { LeasesController } from './leases.controller';
import { LeasesService } from './leases.service';

@Module({
  imports: [AuthModule, DealsModule],
  controllers: [LeasesController],
  providers: [LeasesService],
})
export class LeasesModule {}
