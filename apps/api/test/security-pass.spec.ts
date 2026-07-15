import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { JobsService } from '../src/jobs/jobs.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { StorageService } from '../src/storage/storage.service';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
const ALL_TS = walk(SRC);
const read = (p: string) => readFileSync(p, 'utf8');

// ─── §9: audit_log is append-only at the application layer ───────────────────
describe('audit_log is append-only (rule 4, §9)', () => {
  it('has no update/delete/upsert path anywhere in the codebase', () => {
    const offenders = ALL_TS.filter((p) =>
      /auditLog\.(update|delete|upsert|updateMany|deleteMany)\b/.test(read(p)),
    );
    expect(offenders).toEqual([]);
  });

  it('the only write to auditLog is a single create, in AuditService', () => {
    const writers = ALL_TS.filter((p) => /auditLog\.create\b/.test(read(p)));
    expect(writers.map((p) => p.replace(SRC, ''))).toEqual([`${'/audit/audit.service.ts'}`]);
  });

  it('never mutates audit_log via raw SQL', () => {
    const raw = ALL_TS.filter((p) => {
      const s = read(p);
      return /\$executeRaw|\$queryRaw/.test(s) && /audit_log/i.test(s);
    });
    expect(raw).toEqual([]);
  });
});

// ─── §9/rule 12: auth is Clerk; nothing else mints a session ─────────────────
describe('no session is minted outside the Clerk flow (rule 12)', () => {
  it('never signs a JWT / session token', () => {
    const signers = ALL_TS.filter((p) =>
      /new SignJWT|jwt\.sign\(|jsonwebtoken|SignJWT\(/.test(read(p)),
    );
    expect(signers).toEqual([]);
  });

  it('uses jose only to VERIFY Clerk tokens (JWKS), never to sign', () => {
    const joseFiles = ALL_TS.filter((p) => /from 'jose'/.test(read(p)));
    expect(joseFiles.map((p) => p.replace(SRC, ''))).toEqual(['/auth/clerk-verifier.service.ts']);
    const s = read(joseFiles[0]);
    expect(s).toMatch(/jwtVerify/);
    expect(s).not.toMatch(/SignJWT|\.sign\(/);
  });
});

// ─── §3/§9: every route is guarded or an explicit, intentional public route ──
describe('object-scoping guards cover every route (§9)', () => {
  // The ONLY endpoints allowed to skip ClerkAuthGuard, each for a documented
  // reason. Anything else without ClerkAuthGuard is a security regression.
  const PUBLIC_ALLOWLIST = new Set([
    '/health/health.controller.ts', // uptime monitoring, no data
    '/listings/public-listings.controller.ts', // public browse (§5/§6)
    '/intakes/public-agencies.controller.ts', // public agency directory (§15)
    '/agency-applications/public-agency-applications.controller.ts', // public "become an agency" application (§2/§15), throttled, no data read
    '/webhooks/clerk-webhook.controller.ts', // Svix-signature verified inside
  ]);

  it('each controller either uses ClerkAuthGuard or is a known public route', () => {
    const controllers = ALL_TS.filter((p) => /@Controller\(/.test(read(p)));
    const unguarded = controllers
      .filter((p) => !read(p).includes('ClerkAuthGuard'))
      .map((p) => p.replace(SRC, ''))
      .filter((rel) => !PUBLIC_ALLOWLIST.has(rel));
    expect(unguarded).toEqual([]);
  });

  it('the Svix webhook verifies its signature before trusting the body', () => {
    const s = read(join(SRC, 'webhooks/clerk-webhook.controller.ts'));
    expect(s).toMatch(/verifySvixSignature/);
    expect(s).toMatch(/invalid_signature/);
  });
});

// ─── §9: presigned-only, audited document access (re-verify phase 4/5) ───────
describe('documents are served only via short-lived presigned URLs, audited', () => {
  const s = read(join(SRC, 'deals/documents.service.ts'));
  it('issues a presigned GET with the short document TTL and audits every issue', () => {
    expect(s).toMatch(/presignGet\(doc\.fileKey,\s*DOCUMENT_URL_TTL_SECONDS\)/);
    expect(s).toMatch(/action: 'document\.url_issued'/);
  });
  it('gates issuance by role: customer, verifier, or platform admin only', () => {
    expect(s).toMatch(/deal\.customerId === userId/);
    expect(s).toMatch(/can_verify_required/);
    expect(s).toMatch(/ForbiddenException\('not_allowed'\)/);
  });
});

// ─── §9 retention: 90-day purge keeps closed-deal docs, drops failed/expired ─
describe('retention purge keeps closed-deal docs, removes only failed/expired (§9)', () => {
  const NOW = new Date('2026-07-11T00:00:00Z');
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

  it('deletes old docs from dead deals but never from closed deals', async () => {
    // dealState → state lookup for the fake `deal: { state: { in } }` filter.
    const dealState: Record<string, string> = {
      dClosed: 'closed',
      dExpired: 'expired',
      dRejected: 'docs_rejected',
      dWithdrawn: 'withdrawn',
    };
    const docs = [
      { id: 'A', dealId: 'dClosed', fileKey: 'k/A', createdAt: daysAgo(200) }, // KEEP (closed)
      { id: 'B', dealId: 'dExpired', fileKey: 'k/B', createdAt: daysAgo(120) }, // REMOVE
      { id: 'C', dealId: 'dRejected', fileKey: 'k/C', createdAt: daysAgo(120) }, // REMOVE
      { id: 'D', dealId: 'dWithdrawn', fileKey: 'k/D', createdAt: daysAgo(10) }, // KEEP (recent)
      { id: 'E', dealId: 'dClosed', fileKey: 'k/E', createdAt: daysAgo(5) }, // KEEP (recent+closed)
    ];
    const deletedRows: string[] = [];
    const deletedObjects: string[] = [];

    const prisma = {
      customerDocument: {
        findMany: async ({ where, select: _select }: any) => {
          const cutoff: Date = where.createdAt.lt;
          const states: string[] = where.deal.state.in;
          return docs
            .filter((d) => d.createdAt < cutoff && states.includes(dealState[d.dealId]))
            .map((d) => ({ id: d.id, fileKey: d.fileKey }));
        },
        delete: async ({ where }: any) => {
          deletedRows.push(where.id);
        },
      },
    } as unknown as PrismaService;
    const storage = {
      deleteObject: async (key: string) => {
        deletedObjects.push(key);
      },
    } as unknown as StorageService;

    const jobs = new JobsService(prisma, {} as any, {} as any, storage);
    const removed = await jobs.purgeExpiredDocuments(NOW);

    expect(removed).toBe(2);
    expect(deletedRows.sort()).toEqual(['B', 'C']);
    expect(deletedObjects.sort()).toEqual(['k/B', 'k/C']);
    // The closed-deal document (A) and the recent ones (D, E) are untouched.
    expect(deletedRows).not.toContain('A');
    expect(deletedObjects).not.toContain('k/A');
  });
});
