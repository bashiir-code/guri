import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DealsModule } from '../deals/deals.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  imports: [AuthModule, DealsModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
