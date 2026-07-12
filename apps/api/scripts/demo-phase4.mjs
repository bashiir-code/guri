// Phase-4 demo: customer captures ID → verifier views it (audited) →
// approves (its own audit action) → deal 'approved', listing still reserved.
// Continues Liban's deal from the phase-3 demo, on the real services + DB.
// Usage: node --env-file=../../.env scripts/demo-phase4.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { NestFactory } = require('@nestjs/core');
const sharp = require('sharp');
const { AppModule } = require('../dist/app.module.js');
const { PrismaService } = require('../dist/prisma/prisma.service.js');
const { DealStateService } = require('../dist/deals/deal-state.service.js');
const { DocumentsService } = require('../dist/deals/documents.service.js');

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['log', 'warn', 'error'],
});
const prisma = app.get(PrismaService);
const dealState = app.get(DealStateService);
const documents = app.get(DocumentsService);

const agency = await prisma.agency.findFirstOrThrow({ where: { name: 'Karan Realty' } });
const listing = await prisma.listing.findFirstOrThrow({
  where: { agencyId: agency.id, publishedAt: { not: null } },
});
const liban = await prisma.user.findUniqueOrThrow({ where: { email: 'demo.liban@guri.test' } });
const verifierMember = await prisma.agencyMember.findFirstOrThrow({
  where: { agencyId: agency.id, canVerify: true, active: true },
  include: { user: { select: { name: true, email: true } } },
});
const ctx = { agencyId: agency.id, roles: [verifierMember.role], canVerify: true };

const status = async () =>
  (await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).status;
const step = async (label) => console.log(`\n== ${label} | listing status: ${await status()}`);

let deal = await prisma.deal.findFirstOrThrow({
  where: {
    listingId: listing.id,
    customerId: liban.id,
    state: { in: ['viewing_scheduled', 'awaiting_docs', 'docs_in_review', 'requested'] },
  },
});
if (deal.state === 'requested') {
  deal = await dealState.select(ctx, verifierMember.userId, deal.id, new Date());
}
if (deal.state === 'viewing_scheduled') {
  deal = await dealState.viewingOutcome(ctx, verifierMember.userId, deal.id, 'proceed');
}
await step(`Liban's deal is at ${deal.state}`);

if (deal.state === 'awaiting_docs') {
  // "customer captures ID" — a generated photo through the real pipeline
  const idPhoto = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 240, g: 240, b: 235 } },
  })
    .jpeg()
    .toBuffer();
  const res = await documents.upload(
    liban.id,
    deal.id,
    { idType: 'national_id', capturedVia: 'camera' },
    { buffer: idPhoto },
  );
  deal = res.deal;
  await step(`Liban uploaded his national ID (camera) → ${deal.state}`);
}

const view = await documents.issueUrl(verifierMember.userId, deal.id);
const fetched = await fetch(view.url);
console.log(
  `verifier ${verifierMember.user.name ?? verifierMember.user.email} opened the document: HTTP ${fetched.status}, url expires in ${view.expiresInSeconds}s`,
);

deal = await documents.verify(ctx, verifierMember.userId, deal.id, { decision: 'approve' });
await step(`verifier approved → deal ${deal.state}`);

const doc = await prisma.customerDocument.findFirstOrThrow({
  where: { dealId: deal.id },
  orderBy: { createdAt: 'desc' },
});
const audit = await prisma.auditLog.findMany({
  where: {
    OR: [
      { objectType: 'customer_document', objectId: doc.id },
      { objectType: 'deal', objectId: deal.id },
    ],
  },
  orderBy: { createdAt: 'asc' },
  include: { actor: { select: { name: true, email: true } } },
});
console.log('\n== audit_log (who viewed, who decided):');
for (const row of audit) {
  const who = row.actor?.name ?? row.actor?.email ?? 'system';
  console.log(`  ${row.createdAt.toISOString()}  ${row.action.padEnd(24)} by ${who}`);
}

await app.close();
