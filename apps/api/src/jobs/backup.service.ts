import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { StorageService } from '../storage/storage.service';

const execAsync = promisify(exec);

export interface BackupResult {
  key: string;
  dumpBytes: number;
  gzBytes: number;
}

// §8 nightly database backup: pg_dump → gzip → encrypted bucket. Extracted from
// the scheduler so it is a real, reusable service the RESTORE test can invoke
// directly (an unrestored backup proves nothing — see scripts/backup-restore-test.mjs).
//
// The dump binary is configurable via PG_DUMP_CMD so the SAME code runs both in
// prod (where the API container has `pg_dump` on PATH) and in local dev (where
// PG_DUMP_CMD points at `docker exec guri-postgres pg_dump`). Default: `pg_dump`.
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  backupKeyFor(now: Date): string {
    return `backups/guri-${now.toISOString().slice(0, 10)}.sql.gz`;
  }

  // Prisma tacks `?schema=public` (and sometimes pgbouncer/connection_limit)
  // onto DATABASE_URL; libpq/pg_dump reject those. Strip Prisma-only params but
  // keep anything libpq understands (e.g. sslmode, which matters in prod).
  private pgDumpUrl(url: string): string {
    try {
      const u = new URL(url);
      for (const p of ['schema', 'pgbouncer', 'connection_limit', 'connect_timeout', 'pool_timeout']) {
        u.searchParams.delete(p);
      }
      return u.toString();
    } catch {
      return url;
    }
  }

  // Best-effort in the scheduler (a failure never breaks the app), but returns
  // the artifact details so the restore test can assert on them.
  async backupToBucket(now: Date = new Date()): Promise<BackupResult | null> {
    const url = this.config.get<string>('DATABASE_URL');
    if (!url) {
      this.logger.warn('DATABASE_URL not set — skipping backup');
      return null;
    }
    const pgDump = this.config.get<string>('PG_DUMP_CMD') ?? 'pg_dump';
    const { stdout } = await execAsync(
      `${pgDump} --no-owner --format=plain "${this.pgDumpUrl(url)}"`,
      { maxBuffer: 512 * 1024 * 1024 },
    );
    const dump = Buffer.from(stdout, 'utf8');
    const gz = gzipSync(dump);
    const key = this.backupKeyFor(now);
    await this.storage.putObject(key, gz, 'application/gzip');
    this.logger.log(`database backup written to ${key} (${gz.length} bytes gzipped)`);
    return { key, dumpBytes: dump.length, gzBytes: gz.length };
  }
}
