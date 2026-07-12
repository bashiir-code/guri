// Phase-9 backup RESTORE test (§8). An unrestored backup proves nothing, so
// this runs the REAL nightly backup job (pg_dump → gzip → encrypted bucket),
// pulls the artifact back OUT of the bucket, restores it into a throwaway
// database, and asserts that every table's row count matches the source AND
// that a known record — Liban's lease — comes back intact. Exits non-zero on
// any mismatch. Scratch DB + test object are cleaned up in a finally block.
//
// Usage: cd apps/api && JOBS_DISABLED=true node --env-file=../../.env scripts/backup-restore-test.mjs
import { NestFactory } from '@nestjs/core';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { AppModule } from '../dist/app.module.js';
import { BackupService } from '../dist/jobs/backup.service.js';
import { StorageService } from '../dist/storage/storage.service.js';

const CONTAINER = 'guri-postgres';
const SOURCE_DB = 'guri';
const SCRATCH_DB = 'guri_restore_test';
const fail = (msg) => {
  console.error(`\n❌ ${msg}`);
  process.exitCode = 1;
};

// Run psql inside the Postgres container (version-matched, no host client).
function psql(db, sql, input) {
  const args = ['exec', '-i', CONTAINER, 'psql', '-U', 'guri', '-d', db, '-v', 'ON_ERROR_STOP=1'];
  if (sql) args.push('-tAc', sql);
  return execFileSync('docker', args, {
    input: input ?? undefined,
    maxBuffer: 512 * 1024 * 1024,
    encoding: 'utf8',
  });
}
const count = (db, table) => Number(psql(db, `SELECT count(*) FROM "${table}"`).trim());

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
const backup = app.get(BackupService);
const storage = app.get(StorageService);
let objectKey = null;

try {
  // 1) Run the actual backup job: pg_dump → gzip → bucket.
  console.log('1) running the real nightly backup job (pg_dump → gzip → bucket)…');
  const result = await backup.backupToBucket();
  if (!result) throw new Error('backupToBucket returned null (DATABASE_URL unset?)');
  objectKey = result.key;
  console.log(
    `   wrote ${result.key}: ${result.dumpBytes} B SQL → ${result.gzBytes} B gzipped ` +
      `(${((1 - result.gzBytes / result.dumpBytes) * 100).toFixed(0)}% smaller)`,
  );

  // 2) Pull the artifact back OUT of the bucket and decompress it.
  console.log('2) downloading the artifact from the bucket and gunzipping…');
  const gz = await storage.getObject(objectKey);
  const sql = gunzipSync(gz).toString('utf8');
  if (gz.length !== result.gzBytes) fail(`bucket bytes ${gz.length} != written ${result.gzBytes}`);
  if (sql.length !== result.dumpBytes) fail(`restored SQL ${sql.length} B != dumped ${result.dumpBytes} B`);
  console.log(`   round-tripped ${gz.length} B from bucket, decompressed to ${sql.length} B SQL`);

  // 3) Restore into a fresh scratch database.
  console.log(`3) restoring into a fresh "${SCRATCH_DB}"…`);
  psql('postgres', `DROP DATABASE IF EXISTS ${SCRATCH_DB}`);
  psql('postgres', `CREATE DATABASE ${SCRATCH_DB}`);
  psql(SCRATCH_DB, null, sql); // pipe the dump via stdin
  console.log('   restore completed with ON_ERROR_STOP=1 (any SQL error would have aborted)');

  // 4) Compare row counts for every table, source vs restored.
  console.log('\n4) row-count parity (source → restored):');
  const tables = psql(
    SOURCE_DB,
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  let mismatches = 0;
  for (const t of tables) {
    const a = count(SOURCE_DB, t);
    const b = count(SCRATCH_DB, t);
    const ok = a === b;
    if (!ok) mismatches++;
    console.log(`   ${ok ? '✓' : '✗'} ${t.padEnd(20)} ${String(a).padStart(5)} → ${String(b).padStart(5)}`);
  }
  if (mismatches > 0) fail(`${mismatches} table(s) had mismatched row counts`);
  else console.log(`   all ${tables.length} tables match`);

  // 5) Assert a known record survives verbatim: Liban's lease.
  console.log("\n5) known-record check — Liban's lease:");
  const q =
    "SELECT l.id||'|'||l.rent_usd||'|'||l.deposit_usd||'|'||to_char(l.end_date,'YYYY-MM-DD')||'|'||l.status " +
    "FROM leases l JOIN users u ON u.id=l.customer_id WHERE u.email='demo.liban@guri.test'";
  const src = psql(SOURCE_DB, q).trim();
  const res = psql(SCRATCH_DB, q).trim();
  console.log(`   source  : ${src}`);
  console.log(`   restored: ${res}`);
  if (!src) fail('Liban lease not found in SOURCE (seed missing?)');
  else if (src !== res) fail('Liban lease differs after restore');
  else console.log('   ✓ identical after restore');
} catch (e) {
  fail(`restore test threw: ${e?.stack ?? e}`);
} finally {
  // Cleanup: drop scratch DB and delete the test artifact from the bucket.
  try {
    psql('postgres', `DROP DATABASE IF EXISTS ${SCRATCH_DB}`);
    console.log(`\ncleaned up scratch database "${SCRATCH_DB}"`);
  } catch (e) {
    console.error(`cleanup: could not drop ${SCRATCH_DB}: ${e}`);
  }
  if (objectKey) {
    await storage.deleteObject(objectKey).catch(() => {});
    console.log(`cleaned up test backup object ${objectKey}`);
  }
  await app.close();
}

console.log(`\nRESULT: ${process.exitCode ? 'FAIL' : 'PASS'}`);
