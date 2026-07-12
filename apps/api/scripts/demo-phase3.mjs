// Phase-3 demo: two customers request → agent schedules one (reserved, second
// queued) → 2nd select 409s → no-show → available → agent schedules the second.
// Runs the REAL compiled services (state machine, derived status, console
// notifications) against the live Postgres.
// Usage: node --env-file=../../.env scripts/demo-phase3.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const { PrismaService } = require('../dist/prisma/prisma.service.js');
const { DealStateService } = require('../dist/deals/deal-state.service.js');
const { DealsService } = require('../dist/deals/deals.service.js');

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['log', 'warn', 'error'],
});
const prisma = app.get(PrismaService);
const dealState = app.get(DealStateService);
const dealsService = app.get(DealsService);

const agency = await prisma.agency.findFirstOrThrow({ where: { name: 'Karan Realty' } });
const listing = await prisma.listing.findFirstOrThrow({
  where: { agencyId: agency.id, publishedAt: { not: null } },
});
const agentMember = await prisma.agencyMember.findFirstOrThrow({
  where: { agencyId: agency.id, role: 'admin' },
});
const ctx = { agencyId: agency.id, roles: ['admin'] };

const status = async () =>
  (await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).status;
const step = async (label) => console.log(`\n== ${label} | listing status: ${await status()}`);

// demo customers (idempotent)
const customer = async (email, name, phone) =>
  prisma.user.upsert({ where: { email }, create: { email, name, phone }, update: { name, phone } });
const khadra = await customer('demo.khadra@guri.test', 'Khadra Yusuf', '+252615550001');
const liban = await customer('demo.liban@guri.test', 'Liban Aden', '+252615550002');

// reset any leftovers from a previous demo run (through the state machine)
for (const c of [khadra, liban]) {
  const open = await prisma.deal.findFirst({
    where: {
      listingId: listing.id,
      customerId: c.id,
      state: { in: ['requested', 'viewing_scheduled', 'awaiting_docs'] },
    },
  });
  if (open) await dealState.transition(open.id, 'withdraw', c.id, 'demo reset');
}

await step('start');

const d1 = await dealState.createRequest(listing.id, khadra.id);
const d2 = await dealState.createRequest(listing.id, liban.id);
await step(`both customers requested (${d1.state}, ${d2.state}) — requests never reserve`);

const tomorrow10 = new Date(Date.now() + 24 * 3600e3);
tomorrow10.setHours(10, 0, 0, 0);
await dealState.select(ctx, agentMember.userId, d1.id, tomorrow10);
await step('agent scheduled Khadra — derived reserve');

try {
  await dealState.select(ctx, agentMember.userId, d2.id, tomorrow10);
} catch (e) {
  console.log(`second select for Liban → ${e.status} ${e.message}`);
}

const q1 = await dealsService.listingQueue(ctx, listing.id);
console.log(
  `queue: active=${q1.active?.customer.name} (${q1.active?.state}), waiting=[${q1.queue
    .map((d) => d.customer.name)
    .join(', ')}]`,
);

await dealState.viewingOutcome(ctx, agentMember.userId, d1.id, 'no_show');
await step('no-show recorded for Khadra — listing released, queue intact');

const q2 = await dealsService.listingQueue(ctx, listing.id);
console.log(`queue now: active=${q2.active}, waiting=[${q2.queue.map((d) => d.customer.name)}]`);

await dealState.select(ctx, agentMember.userId, d2.id, tomorrow10);
await step('agent scheduled Liban (the next in queue)');

const events = await prisma.dealEvent.findMany({
  where: { dealId: { in: [d1.id, d2.id] } },
  orderBy: { createdAt: 'asc' },
});
console.log('\n== deal_events audit trail:');
for (const e of events) {
  const who = e.actorId === agentMember.userId ? 'agent' : 'customer';
  console.log(
    `  ${e.createdAt.toISOString()}  ${(e.fromState ?? '(new)').padEnd(18)} -> ${e.toState.padEnd(18)} by ${who}`,
  );
}

await app.close();
