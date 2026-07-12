import { Injectable, Logger } from '@nestjs/common';
import { SmsPort } from './sms.port';

// Dev stub per CLAUDE.md: log to console instead of sending SMS.
@Injectable()
export class ConsoleSmsAdapter implements SmsPort {
  private readonly logger = new Logger('SMS');

  async send(phone: string, message: string): Promise<void> {
    this.logger.log(`[dev sms] to ${phone}: ${message}`);
  }
}
