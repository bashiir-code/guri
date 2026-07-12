// Phase-6 demo: Axmed Warsame claims his invite (email link → claimed, no
// duplicate account) → sees exactly his one rented property, tenant Liban,
// lease to 2027-08-01, income $600 — and the 403 proof that he cannot touch
// any agency endpoint. Real services + DB.
// Usage: node --env-file=../../.env scripts/demo-phase6.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { NestFactory, Reflector } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const { PrismaService } = require('../dist/prisma/prisma.service.js');
const { ClerkSyncService } = require('../dist/webhooks/clerk-sync.service.js');
const { OwnerService } = require('../dist/owner/owner.service.js');
const { AgencyGuard } = require('../dist/auth/agency.guard.js');

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
const prisma = app.get(PrismaService);
const sync = app.get(ClerkSyncService);
const ownerService = app.get(OwnerService);

const EMAIL = 'axmed.warsame@guri.test';

// The agency entered Axmed's email on the invite (phase-1 owners form).
const axmed = await prisma.user.findFirstOrThrow({ where: { phone: '+252677777777' } });
if (!axmed.email) {
  await prisma.user.update({ where: { id: axmed.id }, data: { email: EMAIL } });
}
const ownerRowBefore = await prisma.owner.findFirstOrThrow({ where: { userId: axmed.id } });
console.log(`before claim: invite_status=${ownerRowBefore.inviteStatus}, clerk_user_id=${axmed.clerkUserId}`);

// == claim: Axmed signs in with Google → Clerk webhook fires user.created ==
const event = {
  type: 'user.created',
  data: {
    id: 'user_demo_axmed',
    first_name: 'Axmed',
    last_name: 'Warsame',
    primary_email_address_id: 'em1',
    email_addresses: [{ id: 'em1', email_address: EMAIL }],
  },
};
await sync.processEvent(event);
await sync.processEvent(event); // replay / second sign-in

const after = await prisma.user.findMany({ where: { email: EMAIL } });
const ownerRowAfter = await prisma.owner.findFirstOrThrow({ where: { userId: axmed.id } });
console.log(
  `after claim:  invite_status=${ownerRowAfter.inviteStatus}, clerk_user_id=${after[0].clerkUserId}, accounts with this email: ${after.length}`,
);

// == the read-only dashboard, scoped to HIS ownerIds ==
const ownerIds = (
  await prisma.owner.findMany({ where: { userId: axmed.id }, select: { id: true } })
).map((r) => r.id);
const ctx = { ownerIds };

const dash = await ownerService.dashboard(ctx, axmed.id);
console.log(
  `\ndashboard: properties=${dash.properties}, occupied=${dash.occupied}, incomeThisMonth=$${dash.incomeThisMonth}, collectedThisYear=$${dash.collectedThisYear}`,
);

const props = await ownerService.properties(ctx);
for (const p of props) {
  console.log(
    `property: ${p.district} · ${p.neighborhood} — ${p.status}, tenant ${p.currentLease?.tenantName}, lease to ${p.currentLease?.endDate.toISOString().slice(0, 10)} (${p.currentLease?.daysToEnd} days left)`,
  );
}

const ledger = await ownerService.payments(ctx, {});
console.log('\nincome ledger:');
for (const i of ledger.items) {
  console.log(`  ${i.paidOn.toISOString().slice(0, 10)}  ${i.type.padEnd(14)} $${i.amountUsd}`);
}
console.log('monthly totals:', ledger.monthlyTotals.map((m) => `${m.month}: $${m.totalUsd}`).join(', '));

// == the 403 proof: every agency/deal/lease write sits behind AgencyGuard ==
const guard = new AgencyGuard(prisma, new Reflector());
const fakeCtx = {
  switchToHttp: () => ({ getRequest: () => ({ user: { sub: axmed.id }, headers: {} }) }),
  getHandler: () => undefined,
  getClass: () => undefined,
};
try {
  await guard.canActivate(fakeCtx);
  console.log('\nUNEXPECTED: owner passed the agency guard!');
} catch (e) {
  console.log(
    `\nagency guard for Axmed → ${e.status} ${e.message} (blocks PATCH /listings/*, /deals/*/select|verify|close, POST /leases/*/payments)`,
  );
}

await app.close();
