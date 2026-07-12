import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ListingsModule } from '../listings/listings.module';
import { DealsController } from './deals.controller';
import { AgencyDealsController } from './agency-deals.controller';
import { DealsService } from './deals.service';
import { DealStateService } from './deal-state.service';
import { DocumentsService } from './documents.service';
import { AgreementsService } from './agreements.service';

@Module({
  imports: [AuthModule, ListingsModule],
  controllers: [AgencyDealsController, DealsController],
  providers: [DealsService, DealStateService, DocumentsService, AgreementsService],
  exports: [DealStateService],
})
export class DealsModule {}
