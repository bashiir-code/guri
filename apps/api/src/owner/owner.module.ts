import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OwnerController } from './owner.controller';
import { OwnerService } from './owner.service';
import { OwnerGuard } from './owner.guard';

@Module({
  imports: [AuthModule],
  controllers: [OwnerController],
  providers: [OwnerService, OwnerGuard],
})
export class OwnerModule {}
