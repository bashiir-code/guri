import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

// Uptime pings hit this on a tight cadence (UptimeRobot, §9) — never throttle it.
// It verifies the two hard dependencies — Postgres and the object bucket — so a
// green ping means the app can actually serve, not just accept a TCP connection.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  async check() {
    const [db, bucket] = await Promise.all([
      this.prisma
        .$queryRaw`SELECT 1`.then(() => true)
        .catch(() => false),
      this.storage
        .ping()
        .then(() => true)
        .catch(() => false),
    ]);

    const body = {
      status: db && bucket ? 'ok' : 'degraded',
      db: db ? 'up' : 'down',
      bucket: bucket ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
    // 503 when any dependency is down so uptime checks alert on it.
    if (!db || !bucket) throw new ServiceUnavailableException(body);
    return body;
  }
}
