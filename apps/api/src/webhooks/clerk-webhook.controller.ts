import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { verifySvixSignature } from './svix';
import { ClerkSyncService, type ClerkWebhookEvent } from './clerk-sync.service';

// POST /webhooks/clerk — the user-sync webhook (SPEC §6 v1.9). Verifies the
// Clerk/Svix signing secret against the RAW body before trusting anything.
// Rate-limit exempt (§9): Svix-signed machine traffic from Clerk, not user
// traffic, and Clerk retries with backoff — a 429 here would drop real syncs.
@SkipThrottle()
@Controller('webhooks')
export class ClerkWebhookController {
  private readonly secret?: string;

  constructor(
    private readonly sync: ClerkSyncService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('CLERK_WEBHOOK_SECRET');
  }

  @Post('clerk')
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId?: string,
    @Headers('svix-timestamp') svixTimestamp?: string,
    @Headers('svix-signature') svixSignature?: string,
  ) {
    if (!this.secret) throw new ServiceUnavailableException('webhook_not_configured');
    if (!svixId || !svixTimestamp || !svixSignature || !req.rawBody) {
      throw new BadRequestException('missing_signature_headers');
    }
    try {
      verifySvixSignature({
        secret: this.secret,
        id: svixId,
        timestamp: svixTimestamp,
        payload: req.rawBody,
        signatureHeader: svixSignature,
      });
    } catch {
      throw new BadRequestException('invalid_signature');
    }

    const event = JSON.parse(req.rawBody.toString()) as ClerkWebhookEvent;
    await this.sync.processEvent(event);
    return { received: true };
  }
}
