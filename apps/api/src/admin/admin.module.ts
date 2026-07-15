import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController, AdminOversightController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController, AdminOversightController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
