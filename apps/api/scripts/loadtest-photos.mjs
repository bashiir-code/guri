// Phase-9 load test: the photo pipeline (sharp → WebP → encrypted bucket) is
// the pilot's heaviest path. This drives the REAL StorageService against the
// REAL MinIO bucket at rising concurrency, reports throughput + where it
// degrades, and confirms malformed images are rejected cleanly mid-load
// without taking the worker down. Scratch objects are deleted at the end.
//
// Usage: cd apps/api && JOBS_DISABLED=true node --env-file=../../.env scripts/loadtest-photos.mjs
import { NestFactory } from '@nestjs/core';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import sharp from 'sharp';
import { AppModule } from '../dist/app.module.js';
import { StorageService } from '../dist/storage/storage.service.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
const storage = app.get(StorageService);

const TOTAL_PER_WAVE = 60; // uploads per concurrency wave
const CONCURRENCIES = [1, 2, 4, 8, 16, 24];
const createdKeys = [];

// Build a handful of DISTINCT, realistic ~12 MP photos (random noise so WebP
// can't cheat with a trivially-compressible solid color). Reused across waves.
console.log('preparing source images (5 × 4000×3000 noisy JPEGs)…');
const sources = [];
for (let i = 0; i < 5; i++) {
  const w = 4000, h = 3000;
  const raw = Buffer.allocUnsafe(w * h * 3);
  for (let p = 0; p < raw.length; p++) raw[p] = (Math.random() * 256) | 0;
  const jpeg = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 85 })
    .toBuffer();
  sources.push(jpeg);
}
const avgSrcMB = sources.reduce((a, b) => a + b.length, 0) / sources.length / 1e6;
console.log(`  source JPEG avg ${avgSrcMB.toFixed(2)} MB\n`);

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function oneUpload(idx) {
  const src = sources[idx % sources.length];
  const t0 = performance.now();
  const webp = await storage.processPhotoToWebp(src);
  const key = `loadtest/${Date.now()}-${idx}-${Math.random().toString(36).slice(2)}.webp`;
  await storage.putObject(key, webp, 'image/webp');
  createdKeys.push(key);
  return { ms: performance.now() - t0, outBytes: webp.length };
}

// Fixed-size worker pool running `total` uploads at `concurrency` in flight.
async function runWave(concurrency, total) {
  const latencies = [];
  let outBytes = 0;
  let next = 0;
  const t0 = performance.now();
  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= total) return;
      const r = await oneUpload(idx);
      latencies.push(r.ms);
      outBytes += r.outBytes;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const wallSec = (performance.now() - t0) / 1000;
  latencies.sort((a, b) => a - b);
  return {
    concurrency,
    total,
    wallSec,
    throughput: total / wallSec,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    outMB: outBytes / 1e6,
  };
}

console.log(`host: ${os.cpus().length} CPU cores, ${(os.totalmem() / 1e9).toFixed(1)} GB RAM`);
console.log('warming up…');
await runWave(2, 8);

console.log('\n=== photo pipeline throughput (sharp→WebP→MinIO) ===');
console.log('concurrency |  uploads/sec | p50 ms | p95 ms | wall s');
console.log('------------+--------------+--------+--------+-------');
const results = [];
for (const c of CONCURRENCIES) {
  const r = await runWave(c, TOTAL_PER_WAVE);
  results.push(r);
  console.log(
    `${String(c).padStart(11)} | ${r.throughput.toFixed(1).padStart(12)} | ${r.p50
      .toFixed(0)
      .padStart(6)} | ${r.p95.toFixed(0).padStart(6)} | ${r.wallSec.toFixed(1).padStart(5)}`,
  );
}

const peak = results.reduce((a, b) => (b.throughput > a.throughput ? b : a));
console.log(
  `\npeak throughput ${peak.throughput.toFixed(1)} uploads/sec at concurrency ${peak.concurrency}` +
    ` (~${os.cpus().length} cores → sharp is CPU-bound; throughput plateaus once cores saturate).`,
);

// Resilience under load: fire a batch of malformed images concurrently and
// confirm every one is rejected cleanly (400) and the process keeps serving.
console.log('\n=== malformed input under concurrency (must not crash the worker) ===');
const bad = [
  Buffer.alloc(0),
  Buffer.from('not an image at all'),
  Buffer.from(Array.from({ length: 2048 }, (_, i) => (i * 91) % 256)),
];
const outcomes = await Promise.allSettled(
  Array.from({ length: 30 }, (_, i) => storage.processPhotoToWebp(bad[i % bad.length])),
);
const rejected = outcomes.filter(
  (o) => o.status === 'rejected' && /invalid_image/.test(String(o.reason?.message ?? o.reason)),
).length;
const leaked = outcomes.filter((o) => o.status === 'fulfilled').length;
console.log(`  ${rejected}/30 rejected cleanly as invalid_image, ${leaked} leaked through`);
// Prove the worker is still alive and serving right after the bad batch.
const alive = await oneUpload(9999).then(() => true).catch(() => false);
console.log(`  worker still processing a valid image afterwards: ${alive ? 'YES' : 'NO'}`);

// Cleanup scratch objects.
console.log(`\ncleaning up ${createdKeys.length} scratch objects…`);
let deleted = 0;
await Promise.all(
  createdKeys.map((k) => storage.deleteObject(k).then(() => deleted++).catch(() => {})),
);
console.log(`  deleted ${deleted}/${createdKeys.length}`);

await app.close();
const ok = rejected === 30 && leaked === 0 && alive;
console.log(`\nRESULT: ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
