import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { GuriThrottlerGuard } from './common/throttle';
import { pinoParams } from './common/logger';
import { SentryExceptionFilter } from './common/sentry';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { OwnersModule } from './owners/owners.module';
import { ListingsModule } from './listings/listings.module';
import { DealsModule } from './deals/deals.module';
import { LeasesModule } from './leases/leases.module';
import { OwnerModule } from './owner/owner.module';
import { StaffModule } from './staff/staff.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { JobsModule } from './jobs/jobs.module';
import { AccountModule } from './account/account.module';
import { IntakesModule } from './intakes/intakes.module';
import { AgencyApplicationsModule } from './agency-applications/agency-applications.module';

@Module({
  imports: [
    // Single .env at the repo root; apps/.env kept as a fallback.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    // Structured, redacted logging for the whole app (§9).
    LoggerModule.forRoot(pinoParams()),
    // Global default rate limit; hot/abusable endpoints tighten this via
    // @Throttle with the RATE_LIMITS table (§9).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    AuditModule,
    NotificationsModule,
    HealthModule,
    AuthModule,
    AdminModule,
    OwnersModule,
    ListingsModule,
    DealsModule,
    LeasesModule,
    OwnerModule,
    StaffModule,
    WebhooksModule,
    JobsModule,
    AccountModule,
    IntakesModule,
    AgencyApplicationsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: GuriThrottlerGuard },
    // Reports 5xx/unhandled errors to Sentry (no-op without SENTRY_DSN), then
    // falls through to Nest's normal error response.
    { provide: APP_FILTER, useClass: SentryExceptionFilter },
  ],
})
export class AppModule {}
