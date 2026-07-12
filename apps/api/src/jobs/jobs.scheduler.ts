import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobsService } from './jobs.service';
import { PgBossService } from './pgboss.service';
import { BackupService } from './backup.service';

const TICK_QUEUE = 'deal-lease-tick';
const DAILY_QUEUE = 'daily-maintenance';
const WEEKLY_QUEUE = 'weekly-cleanup';

// Wires @nestjs/schedule cron triggers to pg-boss queues (§8). pg-boss owns
// durability + retries; @nestjs/schedule owns the cadence. If pg-boss isn't
// ready, cron runs the work in-process so timers still fire.
@Injectable()
export class JobsScheduler implements OnModuleInit {
  private readonly logger = new Logger(JobsScheduler.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly boss: PgBossService,
    private readonly backup: BackupService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.boss.work(TICK_QUEUE, () => this.jobs.runTick());
    await this.boss.work(DAILY_QUEUE, () => this.runDaily());
    await this.boss.work(WEEKLY_QUEUE, async () => {
      await this.jobs.cleanupOrphanFiles();
    });
  }

  // §8: the 15-minute tick (all §4 + §16 timers).
  @Cron('*/15 * * * *')
  async everyTick(): Promise<void> {
    if (this.boss.isReady()) await this.boss.send(TICK_QUEUE);
    else await this.jobs.runTick();
  }

  // §8: daily lease-end scan + retention purge + nightly DB backup.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async daily(): Promise<void> {
    if (this.boss.isReady()) await this.boss.send(DAILY_QUEUE);
    else await this.runDaily();
  }

  // §8: weekly orphan-file cleanup.
  @Cron(CronExpression.EVERY_WEEK)
  async weekly(): Promise<void> {
    if (this.boss.isReady()) await this.boss.send(WEEKLY_QUEUE);
    else await this.jobs.cleanupOrphanFiles();
  }

  private async runDaily(): Promise<void> {
    await this.jobs.runTick(); // lease-end scan is part of the tick
    await this.jobs.purgeExpiredDocuments(new Date()).catch((e) =>
      this.logger.error(`doc purge failed: ${String(e)}`),
    );
    // §8 nightly backup. Best-effort: a failure never breaks the app.
    await this.backup
      .backupToBucket()
      .catch((e) => this.logger.error(`backup failed: ${String(e)}`));
  }
}
