// Phase-5 demo: Liban's approved deal → agreement PDF → signed scan → atomic
// close (12-month term) → listing 'rented', lease active, payments recorded,
// queued requests auto-closed with notices. Real services + DB.
// Usage: node --env-file=../../.env scripts/demo-phase5.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { NestFactory } = require('@nestjs/core');
const sharp = require('sharp');
const { AppModule } = require('../dist/app.module.js');
const { PrismaService } = require('../dist/prisma/prisma.service.js');
const { DealStateService } = require('../dist/deals/deal-state.service.js');
const { AgreementsService } = require('../dist/deals/agreements.service.js');

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['log', 'warn', 'error'],
});
const prisma = app.get(PrismaService);
const dealState = app.get(DealStateService);
const agreements = app.get(AgreementsService);

const agency = await prisma.agency.findFirstOrThrow({ where: { name: 'Karan Realty' } });
const listing = await prisma.listing.findFirstOrThrow({
  where: { agencyId: agency.id, publishedAt: { not: null } },
});
const liban = await prisma.user.findUniqueOrThrow({ where: { email: 'demo.liban@guri.test' } });
const khadra = await prisma.user.findUniqueOrThrow({ where: { email: 'demo.khadra@guri.test' } });
const agent = await prisma.agencyMember.findFirstOrThrow({
  where: { agencyId: agency.id, canVerify: true, active: true },
  include: { user: { select: { name: true } } },
});
const ctx = { agencyId: agency.id, roles: [agent.role], canVerify: true };

const status = async () =>
  (await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).status;
const step = async (label) => console.log(`\n== ${label} | listing status: ${await status()}`);

const deal = await prisma.deal.findFirstOrThrow({
  where: { listingId: listing.id, customerId: liban.id, state: 'approved' },
});
await step(`Liban's deal is approved`);

// Khadra joins the queue again — she'll be auto-closed by the close
const khadraOpen = await prisma.deal.findFirst({
  where: { listingId: listing.id, customerId: khadra.id, state: 'requested' },
});
const khadraDeal =
  khadraOpen ?? (await dealState.createRequest(listing.id, khadra.id));
console.log(`Khadra is waiting in the queue (deal ${khadraDeal.state})`);

// 1. generate the bilingual PDF with the paper terms
const START = new Date('2026-08-01T00:00:00Z');
await agreements.generate(ctx, agent.userId, deal.id, { termMonths: 12, startDate: START });
const urls = await agreements.issueUrls(agent.userId, deal.id);
const pdfRes = await fetch(urls.pdfUrl);
console.log(
  `agreement generated → HTTP ${pdfRes.status}, ${pdfRes.headers.get('content-type')}, ${(await pdfRes.arrayBuffer()).byteLength} bytes`,
);

// 2. upload the signed scan
const scan = await sharp({
  create: { width: 1000, height: 1400, channels: 3, background: { r: 250, g: 250, b: 245 } },
})
  .jpeg()
  .toBuffer();
await agreements.uploadSigned(ctx, agent.userId, deal.id, { buffer: scan, mimetype: 'image/jpeg' });
await step('signed scan uploaded');

// 3. the atomic close: 12-month term + deposit + first rent in one request
const { lease } = await dealState.close(ctx, agent.userId, deal.id, {
  termMonths: 12,
  startDate: START,
  payments: [
    { type: 'deposit', amountUsd: 300, paidOn: START },
    { type: 'monthly_rent', amountUsd: 300, paidOn: START },
  ],
});
await step('deal CLOSED');

console.log(
  `\nlease: ${lease.status}, ${lease.startDate.toISOString().slice(0, 10)} + ${lease.termMonths}mo → ends ${lease.endDate.toISOString().slice(0, 10)}, rent $${lease.rentUsd}, deposit $${lease.depositUsd}`,
);

const payments = await prisma.payment.findMany({ where: { leaseId: lease.id } });
console.log('\n== payments:');
for (const p of payments) {
  console.log(`  ${p.type.padEnd(14)} $${p.amountUsd}  paid ${p.paidOn.toISOString().slice(0, 10)}`);
}

const khadraAfter = await prisma.deal.findUniqueOrThrow({ where: { id: khadraDeal.id } });
console.log(`\nKhadra's queued deal → ${khadraAfter.state} (${khadraAfter.outcomeReason})`);

const events = await prisma.dealEvent.findMany({
  where: { dealId: { in: [deal.id, khadraDeal.id] } },
  orderBy: { createdAt: 'asc' },
});
console.log('\n== deal_events:');
for (const e of events) {
  console.log(
    `  ${e.createdAt.toISOString()}  ${(e.fromState ?? '(new)').padEnd(18)} -> ${e.toState.padEnd(18)} ${e.note ?? ''}`,
  );
}

const audit = await prisma.auditLog.findMany({
  where: {
    OR: [
      { objectType: 'deal', objectId: deal.id },
      { objectType: 'agreement' },
    ],
    createdAt: { gt: new Date(Date.now() - 10 * 60_000) },
  },
  orderBy: { createdAt: 'asc' },
  include: { actor: { select: { name: true } } },
});
console.log('\n== audit_log:');
for (const row of audit) {
  console.log(`  ${row.action.padEnd(26)} by ${row.actor?.name ?? 'system'}`);
}

await app.close();
