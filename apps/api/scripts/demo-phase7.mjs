// Phase-7 demo (time-travelled data): an old request expires; a lease crosses
// into 'ending_soon' with tenant+agency+owner all notified; a past-due lease
// sits in the GRACE WINDOW still 'rented' with a nudge queued — proving no
// timer ever ended a tenancy. Runs the real JobsService against the live DB,
// then cleans up its scratch rows.
// Usage: node --env-file=../../.env scripts/demo-phase7.mjs
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { JobsService } from '../dist/jobs/jobs.service.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
const prisma = app.get(PrismaService);
const jobs = app.get(JobsService);

const now = new Date();
const days = (n) => new Date(now.getTime() + n * 86_400_000);
const demoStart = new Date();

const agency = await prisma.agency.findFirstOrThrow({ where: { name: 'Karan Realty' } });
const agent = await prisma.agencyMember.findFirstOrThrow({ where: { agencyId: agency.id, active: true } });
const ownerRow = await prisma.owner.findFirstOrThrow({ where: { agencyId: agency.id } });
const tenant = await prisma.user.findFirstOrThrow({ where: { email: 'demo.liban@guri.test' } });

const baseListing = {
  agencyId: agency.id,
  ownerId: ownerRow.id,
  district: 'Karan',
  neighborhood: 'PHASE7-DEMO',
  type: 'house',
  bedrooms: 2,
  bathrooms: 1,
  rentUsd: 300,
  depositUsd: 300,
  descriptionSo: 'demo',
  descriptionEn: 'demo',
  photos: [],
  originalsVerified: true,
  publishedAt: now,
};

const listingIds = [];
const dealIds = [];
async function makeListing(status) {
  const l = await prisma.listing.create({ data: { ...baseListing, status } });
  listingIds.push(l.id);
  return l;
}
async function makeClosedDeal(listingId) {
  const d = await prisma.deal.create({ data: { listingId, customerId: tenant.id, state: 'closed' } });
  dealIds.push(d.id);
  return d;
}
const status = async (id) => (await prisma.listing.findUniqueOrThrow({ where: { id } })).status;

try {
  // --- A) an old 'requested' deal (14+ days untouched) ---
  const lReq = await makeListing('available');
  const staleDeal = await prisma.deal.create({
    data: { listingId: lReq.id, customerId: tenant.id, state: 'requested', createdAt: days(-15) },
  });
  dealIds.push(staleDeal.id);
  await jobs.expireStaleRequests(now);
  const staleAfter = await prisma.deal.findUniqueOrThrow({ where: { id: staleDeal.id } });
  console.log(`\nA) old request (15d) → ${staleAfter.state} · listing ${await status(lReq.id)}`);

  // --- B) a lease 20 days from end_date crosses into 'ending_soon' ---
  const lEnding = await makeListing('rented');
  const dealB = await makeClosedDeal(lEnding.id);
  const leaseB = await prisma.lease.create({
    data: {
      listingId: lEnding.id, customerId: tenant.id, dealId: dealB.id,
      startDate: days(-345), termMonths: 12, endDate: days(20), rentUsd: 300, depositUsd: 300,
      status: 'active',
    },
  });
  await jobs.markLeasesEndingSoon(now);
  const leaseBAfter = await prisma.lease.findUniqueOrThrow({ where: { id: leaseB.id } });
  console.log(`\nB) lease 20d from end → ${leaseBAfter.status} · listing STAYS ${await status(lEnding.id)}`);
  const bNotified = await prisma.notification.findMany({
    where: { dedupeKey: { startsWith: `lease_ending_soon:${leaseB.id}` } },
    include: { user: { select: { name: true } } },
  });
  console.log('   notified:', bNotified.map((n) => n.user.name ?? n.userId).join(', '));

  // --- C) a past-due lease sits in the GRACE WINDOW ---
  const lGrace = await makeListing('rented');
  const dealC = await makeClosedDeal(lGrace.id);
  const leaseC = await prisma.lease.create({
    data: {
      listingId: lGrace.id, customerId: tenant.id, dealId: dealC.id,
      startDate: days(-370), termMonths: 12, endDate: days(-5), rentUsd: 300, depositUsd: 300,
      status: 'ending_soon',
    },
  });
  await jobs.runTick(now); // full tick — grace nudge fires, nothing ends
  const leaseCAfter = await prisma.lease.findUniqueOrThrow({ where: { id: leaseC.id } });
  const graceNudges = await prisma.notification.count({
    where: { dedupeKey: { startsWith: `lease_grace:${leaseC.id}` } },
  });
  console.log(`\nC) past-due lease → STAYS ${leaseCAfter.status} · listing STAYS ${await status(lGrace.id)} · grace nudges queued: ${graceNudges}`);

  // --- the cardinal rule: NO timer ever ended a tenancy ---
  const demoLeases = await prisma.lease.findMany({ where: { listingId: { in: listingIds } } });
  const anyTerminated = demoLeases.some((l) => l.status === 'ended' || l.status === 'vacated');
  console.log(`\nCARDINAL RULE — any lease ended/vacated by a timer? ${anyTerminated ? 'YES (BUG!)' : 'NO ✓'}`);

  // --- idempotency: a second tick sends nothing new ---
  const before = await prisma.notification.count({ where: { createdAt: { gte: demoStart } } });
  await jobs.runTick(now);
  await jobs.expireStaleRequests(now);
  const after = await prisma.notification.count({ where: { createdAt: { gte: demoStart } } });
  console.log(`idempotency — notifications after first run: ${before}, after re-run: ${after} (${before === after ? 'no duplicates ✓' : 'DUPLICATED!'})`);
} finally {
  // cleanup scratch rows (children first)
  await prisma.notification.deleteMany({ where: { createdAt: { gte: demoStart } } });
  await prisma.dealEvent.deleteMany({ where: { dealId: { in: dealIds } } });
  await prisma.lease.deleteMany({ where: { listingId: { in: listingIds } } });
  await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
  await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
  console.log('\n(cleaned up demo scratch rows)');
  await app.close();
}
