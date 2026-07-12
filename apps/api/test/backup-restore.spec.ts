import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// The real proof is scripts/backup-restore-test.mjs (dump → bucket → restore →
// row-count + Liban's-lease assertions), which needs Docker + Postgres + a
// built dist. This wrapper runs that script as part of the suite, but ONLY when
// RESTORE_TEST=1 — so a plain `pnpm test` (no DB) stays green. Enable with:
//   cd apps/api && pnpm build && RESTORE_TEST=1 pnpm test
const enabled = process.env.RESTORE_TEST === '1';

describe.skipIf(!enabled)('backup RESTORE (dump → bucket → restore → verify)', () => {
  it('restores into a scratch DB with matching row counts and record', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const script = resolve(here, '../scripts/backup-restore-test.mjs');
    const out = execFileSync(
      'node',
      ['--env-file=../../.env', script],
      { cwd: resolve(here, '..'), env: { ...process.env, JOBS_DISABLED: 'true' }, encoding: 'utf8' },
    );
    expect(out).toContain('all 16 tables match');
    expect(out).toContain("Liban's lease");
    expect(out).toMatch(/RESULT: PASS/);
  }, 120_000);
});
