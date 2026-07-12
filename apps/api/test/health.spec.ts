import { describe, expect, it } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../src/health/health.controller';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { StorageService } from '../src/storage/storage.service';

// /health must verify BOTH hard dependencies (Postgres + bucket) and return 503
// if either is unreachable, so uptime checks (UptimeRobot, §9) actually alert.

const okPrisma = { $queryRaw: async () => [{ '?column?': 1 }] } as unknown as PrismaService;
const downPrisma = {
  $queryRaw: async () => {
    throw new Error('connection refused');
  },
} as unknown as PrismaService;
const okStorage = { ping: async () => undefined } as unknown as StorageService;
const downStorage = {
  ping: async () => {
    throw new Error('bucket unreachable');
  },
} as unknown as StorageService;

describe('HealthController', () => {
  it('returns ok when DB and bucket are both up', async () => {
    const res = await new HealthController(okPrisma, okStorage).check();
    expect(res).toMatchObject({ status: 'ok', db: 'up', bucket: 'up' });
  });

  it('503 with bucket:down when the bucket is unreachable', async () => {
    const ctrl = new HealthController(okPrisma, downStorage);
    await expect(ctrl.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await ctrl.check().catch((e) => {
      expect(e.getResponse()).toMatchObject({ status: 'degraded', db: 'up', bucket: 'down' });
    });
  });

  it('503 with db:down when Postgres is unreachable', async () => {
    const ctrl = new HealthController(downPrisma, okStorage);
    await ctrl.check().catch((e) => {
      expect(e.getResponse()).toMatchObject({ status: 'degraded', db: 'down', bucket: 'up' });
    });
  });
});
