import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ConsoleSmsAdapter } from './console-sms.adapter';
import { SMS_PORT } from './sms.port';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, { provide: SMS_PORT, useClass: ConsoleSmsAdapter }],
  exports: [NotificationsService, SMS_PORT],
})
export class NotificationsModule {}
