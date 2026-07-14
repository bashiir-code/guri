import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_PORT, SmsPort } from './sms.port';
import { renderSms, type NotificationLocale, type TemplateParams } from './templates';

const BELL_PAGE_SIZE = 5;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PORT) private readonly sms: SmsPort,
  ) {}

  // The single phase-7 entry point (§7). In-app row ALWAYS; SMS when the
  // recipient has a phone and the template has a body. Idempotent via
  // dedupeKey — a retried job can't double-send. A failed SMS is logged and
  // never fails the caller (rule: a failed SMS must not fail the job).
  async notify(input: {
    userId: string;
    phone?: string | null;
    locale?: string | null;
    template: string;
    params?: TemplateParams;
    dedupeKey?: string;
  }): Promise<{ sent: boolean }> {
    if (input.dedupeKey) {
      const existing = await this.prisma.notification.findUnique({
        where: { dedupeKey: input.dedupeKey },
      });
      if (existing) return { sent: false }; // already delivered this event
    }

    const payload = (input.params ?? {}) as Prisma.InputJsonValue;
    const locale: NotificationLocale = input.locale === 'en' ? 'en' : 'so';
    const body = renderSms(input.template, locale, input.params ?? {});
    const willSms = Boolean(input.phone && body);

    try {
      await this.prisma.notification.create({
        data: {
          userId: input.userId,
          channel: willSms ? 'sms' : 'inapp',
          template: input.template,
          payload,
          sentAt: new Date(),
          dedupeKey: input.dedupeKey,
        },
      });
    } catch (e) {
      // Unique clash = a concurrent runner already recorded it — that's fine.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { sent: false };
      }
      throw e;
    }

    if (willSms) {
      try {
        await this.sms.send(input.phone!, body!);
      } catch (err) {
        this.logger.warn(
          `SMS delivery failed for template ${input.template} to ${input.phone}: ${String(err)}`,
        );
      }
    }
    return { sent: true };
  }

  // ---- the in-app bell (§7 screen) ----
  async listForUser(userId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: BELL_PAGE_SIZE,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      unread,
      items: items.map((n) => ({
        id: n.id,
        template: n.template,
        payload: n.payload,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
    };
  }

  async markAllRead(userId: string): Promise<{ ok: true }> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  // ---- backward-compatible helpers (phases 2–6 event notifications) ----
  // These stay so existing callers keep populating the bell; they are not
  // deduped because they fire once per event, not on a recurring tick.
  async recordInApp(input: {
    userId: string;
    template: string;
    payload?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId: input.userId,
        channel: 'inapp',
        template: input.template,
        payload: input.payload ?? {},
        sentAt: new Date(),
      },
    });
  }

  async sendSms(input: {
    userId: string;
    phone: string;
    template: string;
    message: string;
    payload?: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.sms.send(input.phone, input.message);
    } catch (err) {
      this.logger.warn(`SMS delivery failed for ${input.template}: ${String(err)}`);
    }
    await this.prisma.notification.create({
      data: {
        userId: input.userId,
        channel: 'sms',
        template: input.template,
        payload: input.payload ?? {},
        sentAt: new Date(),
      },
    });
  }
}
