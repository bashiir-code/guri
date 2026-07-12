import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ClerkAuthGuard } from '../src/auth/clerk-auth.guard';
import type { ClerkVerifierService } from '../src/auth/clerk-verifier.service';
import { verifySvixSignature } from '../src/webhooks/svix';
import { ClerkSyncService } from '../src/webhooks/clerk-sync.service';
import type { PrismaService } from '../src/prisma/prisma.service';

function contextWithHeaders(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('ClerkAuthGuard — unauthenticated requests are rejected', () => {
  const verifierStub = {
    verify: async () => {
      throw new UnauthorizedException('invalid_token');
    },
  } as unknown as ClerkVerifierService;
  const guard = new ClerkAuthGuard({} as PrismaService, verifierStub);

  it('rejects a request with no Authorization header', async () => {
    await expect(guard.canActivate(contextWithHeaders({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects non-Bearer and garbage tokens', async () => {
    await expect(
      guard.canActivate(contextWithHeaders({ authorization: 'Basic abc' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(contextWithHeaders({ authorization: 'Bearer not-a-jwt' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('Clerk webhook — signature verification (svix scheme)', () => {
  const secret = `whsec_${Buffer.from('guri-test-webhook-secret-32bytes').toString('base64')}`;
  const id = 'msg_test123';
  const payload = JSON.stringify({ type: 'user.created', data: { id: 'user_abc' } });

  function sign(ts: string, body: string): string {
    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const sig = createHmac('sha256', secretBytes).update(`${id}.${ts}.${body}`).digest('base64');
    return `v1,${sig}`;
  }

  it('accepts a correctly signed payload', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(() =>
      verifySvixSignature({
        secret,
        id,
        timestamp: ts,
        payload,
        signatureHeader: sign(ts, payload),
      }),
    ).not.toThrow();
  });

  it('rejects a tampered payload and a stale timestamp', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(() =>
      verifySvixSignature({
        secret,
        id,
        timestamp: ts,
        payload: payload.replace('user_abc', 'user_evil'),
        signatureHeader: sign(ts, payload),
      }),
    ).toThrow();
    const stale = String(Math.floor(Date.now() / 1000) - 3600);
    expect(() =>
      verifySvixSignature({
        secret,
        id,
        timestamp: stale,
        payload,
        signatureHeader: sign(stale, payload),
      }),
    ).toThrow();
  });
});

describe('Clerk webhook — mirrors users locally (rule 13)', () => {
  function makePrisma() {
    const rows: Array<{
      id: string;
      clerkUserId: string | null;
      email: string | null;
      name: string | null;
      active: boolean;
    }> = [];
    const prisma = {
      rows,
      user: {
        findUnique: async ({ where }: { where: { clerkUserId?: string; email?: string } }) =>
          rows.find(
            (r) =>
              (where.clerkUserId && r.clerkUserId === where.clerkUserId) ||
              (where.email && r.email === where.email),
          ) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: `local-${rows.length + 1}`,
            clerkUserId: null,
            email: null,
            name: null,
            active: true,
            ...data,
          } as (typeof rows)[number];
          rows.push(row);
          return row;
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = rows.find((r) => r.id === where.id)!;
          Object.assign(row, data);
          return row;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: { clerkUserId: string };
          data: { active: boolean };
        }) => {
          rows.filter((r) => r.clerkUserId === where.clerkUserId).forEach((r) => Object.assign(r, data));
          return { count: 1 };
        },
      },
      owner: { updateMany: async () => ({ count: 0 }) },
    };
    return prisma;
  }

  it('user.created creates a local users row keyed by clerk_user_id', async () => {
    const prisma = makePrisma();
    const sync = new ClerkSyncService(prisma as unknown as PrismaService);
    await sync.processEvent({
      type: 'user.created',
      data: {
        id: 'user_clerk1',
        first_name: 'Asha',
        last_name: 'Ali',
        primary_email_address_id: 'em_1',
        email_addresses: [{ id: 'em_1', email_address: 'Asha@Example.com' }],
      },
    });
    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0]).toMatchObject({
      clerkUserId: 'user_clerk1',
      email: 'asha@example.com',
      name: 'Asha Ali',
      active: true,
    });
  });

  it('links a Clerk sign-in to an agency-provisioned row by email', async () => {
    const prisma = makePrisma();
    // pre-provisioned by the agency (no clerk id yet)
    prisma.rows.push({
      id: 'local-agent',
      clerkUserId: null,
      email: 'agent@agency.so',
      name: 'Agency Agent',
      active: true,
    });
    const sync = new ClerkSyncService(prisma as unknown as PrismaService);
    await sync.processEvent({
      type: 'user.created',
      data: {
        id: 'user_clerk2',
        primary_email_address_id: 'em_1',
        email_addresses: [{ id: 'em_1', email_address: 'agent@agency.so' }],
      },
    });
    // no duplicate row — the existing one got linked
    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0]).toMatchObject({
      id: 'local-agent',
      clerkUserId: 'user_clerk2',
      name: 'Agency Agent',
    });
  });

  it('user.deleted deactivates (never deletes) the mirrored row', async () => {
    const prisma = makePrisma();
    prisma.rows.push({
      id: 'local-x',
      clerkUserId: 'user_gone',
      email: null,
      name: null,
      active: true,
    });
    const sync = new ClerkSyncService(prisma as unknown as PrismaService);
    await sync.processEvent({ type: 'user.deleted', data: { id: 'user_gone' } });
    expect(prisma.rows[0].active).toBe(false);
    expect(prisma.rows).toHaveLength(1);
  });
});
