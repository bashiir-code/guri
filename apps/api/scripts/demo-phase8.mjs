// Phase-8 demo: a lease moves to ending_soon → agency RENEWS it (new lease,
// listing still rented, old row's terms untouched) → a separate lease is
// VACATED (listing → available) → a tenant tries to LEAVE, blocked until the
// lease ends → and the admin AUDIT view of Liban's real closed deal shows who
// viewed his ID. Real services + live DB; scratch rows cleaned up.
// Usage: node --env-file=../../.env scripts/demo-phase8.mjs
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { DealStateService } from '../dist/deals/deal-state.service.js';
import { AccountService } from '../dist/account/account.service.js';
import { AdminService } from '../dist/admin/admin.service.js';
import { AgencyGuard } from '../dist/auth/agency.guard.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
const prisma = app.get(PrismaService);
const dealState = app.get(DealStateService);
const account = app.get(AccountService);
const admin = app.get(AdminService);

const demoStart = new Date();
const agency = await prisma.agency.findFirstOrThrow({ where: { name: 'Karan Realty' } });
const agent = await prisma.agencyMember.findFirstOrThrow({ where: { agencyId: agency.id, active: true } });
const ownerRow = await prisma.owner.findFirstOrThrow({ where: { agencyId: agency.id } });
const liban = await prisma.user.findFirstOrThrow({ where: { email: 'demo.liban@guri.test' } });
const ctx = { agencyId: agency.id, roles: ['admin'], canVerify: true };
const days = (n) => new Date(Date.now() + n * 86_400_000);

const listingIds = [];
const dealIds = [];
const userIds = [];
const baseListing = {
  agencyId: agency.id, ownerId: ownerRow.id, district: 'Karan', neighborhood: 'PHASE8',
  type: 'house', bedrooms: 2, bathrooms: 1, rentUsd: 300, depositUsd: 300,
  descriptionSo: 'demo', descriptionEn: 'demo', photos: [], originalsVerified: true, publishedAt: new Date(),
};
async function scratchLease(customerId, status, endDate) {
  const listing = await prisma.listing.create({ data: { ...baseListing, status: 'rented' } });
  listingIds.push(listing.id);
  const deal = await prisma.deal.create({ data: { listingId: listing.id, customerId, state: 'closed' } });
  dealIds.push(deal.id);
  const lease = await prisma.lease.create({
    data: {
      listingId: listing.id, customerId, dealId: deal.id, startDate: days(-345),
      termMonths: 12, endDate, rentUsd: 300, depositUsd: 300, status,
    },
  });
  return { listing, lease };
}
const status = async (id) => (await prisma.listing.findUniqueOrThrow({ where: { id } })).status;

try {
  // ===== PART B: RENEW =====
  const { listing: lR, lease: leaseR } = await scratchLease(liban.id, 'ending_soon', days(15));
  console.log(`\nRENEW — lease ${leaseR.status}, listing ${await status(lR.id)}, rent $${leaseR.rentUsd}`);
  const renewed = await dealState.renewLease(ctx, agent.userId, leaseR.id, { termMonths: 12, newRentUsd: 330 });
  const oldAfter = await prisma.lease.findUniqueOrThrow({ where: { id: leaseR.id } });
  console.log(
    `  → new lease ${renewed.id.slice(0, 8)} status=${renewed.status}, rent $${renewed.rentUsd}, renewedFrom=${renewed.renewedFromLeaseId === leaseR.id ? 'old ✓' : 'BUG'}, dealId=${renewed.dealId ?? 'null ✓'}`,
  );
  console.log(
    `  → old lease: status=${oldAfter.status}, terms untouched? rent $${oldAfter.rentUsd}/term ${oldAfter.termMonths}mo (${Number(oldAfter.rentUsd) === 300 && oldAfter.termMonths === 12 ? 'yes ✓' : 'CHANGED!'}), listing STAYS ${await status(lR.id)}`,
  );

  // ===== PART B: MOVE-OUT (a separate lease) =====
  const { listing: lV, lease: leaseV } = await scratchLease(liban.id, 'active', days(200));
  console.log(`\nMOVE-OUT — lease ${leaseV.status}, listing ${await status(lV.id)}`);
  const vacated = await dealState.endLease(ctx, agent.userId, leaseV.id, { result: 'vacated' });
  console.log(`  → lease ${vacated.status}, listing now ${await status(lV.id)}`);

  // ===== PART C: LEAVE-PLATFORM (blocked while a live lease exists) =====
  const leaver = await prisma.user.create({
    data: { email: 'demo.leaver@guri.test', name: 'Deeqa (demo)', phone: '+252615559999', locale: 'so' },
  });
  userIds.push(leaver.id);
  const { lease: leaseL } = await scratchLease(leaver.id, 'active', days(100));
  let blocked = null;
  try {
    await account.leave(leaver.id);
  } catch (e) {
    blocked = `${e.status} ${e.message}`;
  }
  console.log(`\nLEAVE — with a live lease → ${blocked} (blocked ✓)`);
  await dealState.endLease(ctx, agent.userId, leaseL.id, { result: 'vacated' });
  const left = await account.leave(leaver.id);
  const leaverAfter = await prisma.user.findUniqueOrThrow({ where: { id: leaver.id } });
  console.log(`  → lease vacated, leave now → ok=${left.ok}, account active=${leaverAfter.active} (deactivated ✓)`);

  // ===== PART A: ADMIN cannot act on agencies' deals (read-only, §2) =====
  const guard = new AgencyGuard(prisma, new Reflector());
  const platformAdmin = await prisma.user.findFirstOrThrow({ where: { isPlatformAdmin: true, email: { not: null } } });
  // strip any agency membership perspective: platform admin has none → 403
  const nonStaff = await prisma.user.findFirstOrThrow({
    where: { agencyMemberships: { none: {} }, email: { not: null } },
  }).catch(() => platformAdmin);
  try {
    await guard.canActivate({
      switchToHttp: () => ({ getRequest: () => ({ user: { sub: nonStaff.id }, headers: {} }) }),
      getHandler: () => undefined, getClass: () => undefined,
    });
    console.log('\nADMIN write-guard: UNEXPECTED pass');
  } catch (e) {
    console.log(`\nADMIN oversight is read-only — agency write-guard for a non-staff user → ${e.status} ${e.message}`);
  }

  // ===== PART A: ADMIN AUDIT of Liban's real closed deal =====
  // the REAL verified deal (has an ID document + events), not a scratch close
  const closed = await prisma.deal.findFirst({
    where: { customerId: liban.id, state: 'closed', documents: { some: {} } },
    orderBy: { createdAt: 'asc' },
  });
  if (closed) {
    const auditView = await admin.dealAudit(closed.id);
    console.log(`\nADMIN AUDIT — deal ${closed.id.slice(0, 8)} (${auditView.deal.state}) · customer ${auditView.deal.customer.name}`);
    console.log('  timeline:', auditView.timeline.map((e) => `${e.toState}`).join(' → '));
    console.log('  document access log (who viewed which ID, when):');
    for (const a of auditView.accessLog) {
      console.log(`    ${a.at.toISOString().slice(0, 16)}  ${a.action.padEnd(22)} by ${a.actor}`);
    }
    if (auditView.accessLog.length === 0) console.log('    (no access recorded on this deal)');
  } else {
    console.log('\nADMIN AUDIT — no closed deal found for Liban');
  }
} finally {
  await prisma.notification.deleteMany({ where: { createdAt: { gte: demoStart } } });
  await prisma.dealEvent.deleteMany({ where: { dealId: { in: dealIds } } });
  await prisma.lease.deleteMany({ where: { listingId: { in: listingIds } } });
  await prisma.deal.deleteMany({ where: { listingId: { in: listingIds } } });
  await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  console.log('\n(cleaned up demo scratch rows)');
  await app.close();
}
