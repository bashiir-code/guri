import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AgencyListingsController,
  ListingsController,
  OwnerDocsController,
} from './listings.controller';
import { PublicListingsController } from './public-listings.controller';
import { ListingsService } from './listings.service';

@Module({
  imports: [AuthModule],
  // Order matters: static agency routes register before the public
  // GET /listings/:id wildcard cannot swallow them (different prefixes anyway).
  controllers: [
    AgencyListingsController,
    ListingsController,
    OwnerDocsController,
    PublicListingsController,
  ],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
