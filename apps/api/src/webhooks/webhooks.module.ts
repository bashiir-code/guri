import { Module } from '@nestjs/common';
import { ClerkWebhookController } from './clerk-webhook.controller';
import { ClerkSyncService } from './clerk-sync.service';

@Module({
  controllers: [ClerkWebhookController],
  providers: [ClerkSyncService],
})
export class WebhooksModule {}
