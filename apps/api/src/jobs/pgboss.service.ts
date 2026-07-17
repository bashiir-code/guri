import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PgBoss } from 'pg-boss';

// pg-boss v12 is ESM-only; a plain `import()` would be downlevelled to
// require() by the CommonJS build and fail. This keeps a real dynamic import.
const esmImport = new Function('s', 'return import(s)') as (s: string) => Promise<unknown>;

// pg-boss lifecycle wrapper (§8): a Postgres-backed durable queue with retries,
// no Redis. pg-boss v12 is ESM-only, so our CommonJS build loads it via a
// dynamic import(). Boots on module init against DATABASE_URL (creates its own
// `pgboss` schema). If it can't start, it degrades gracefully and the
// scheduler falls back to running jobs in-process.
@Injectable()
export class PgBossService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgBossService.name);
  private boss?: PgBoss;
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('JOBS_DISABLED') === 'true') {
      this.logger.warn('pg-boss disabled via JOBS_DISABLED');
      return;
    }
    const connectionString = this.config.get<string>('DATABASE_URL');
    if (!connectionString) return;
    try {
      const mod = (await esmImport('pg-boss')) as { PgBoss: new (o: unknown) => PgBoss };
      this.boss = new mod.PgBoss({ connectionString, schema: 'pgboss' });
      this.boss.on('error', (e: unknown) => this.logger.error(`pg-boss error: ${String(e)}`));
      await this.boss.start();
      this.ready = true;
      this.logger.log('pg-boss started');
    } catch (e) {
      this.logger.error(`pg-boss failed to start (falling back to in-process): ${String(e)}`);
      this.ready = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop({ graceful: true }).catch(() => undefined);
  }

  isReady(): boolean {
    return this.ready && Boolean(this.boss);
  }

  async work(queue: string, handler: () => Promise<void>): Promise<void> {
    if (!this.boss) return;
    await this.boss.createQueue(queue).catch(() => undefined);
    await this.boss.work(queue, async () => {
      await handler();
    });
  }

  async send(queue: string): Promise<void> {
    if (!this.boss) return;
    // singletonSeconds: every container's @Cron fires in the same minute, so
    // concurrent sends collapse into ONE job per queue per 60s window — N API
    // containers can never enqueue N duplicate ticks. A later window always
    // enqueues fresh, so a slow job never suppresses the next cadence.
    await this.boss.send(queue, {}, { retryLimit: 2, retryDelay: 60, singletonSeconds: 60 });
  }
}
