// Phase-8.5 demo (§17 deactivate, never destroy). Two flows against the live DB
// with the REAL guard + services:
//   1. A head removes a worker → that worker is 403'd at the guard on the next
//      console request → head reactivates → access restored.
//   2. An admin suspends an agency → its published listing vanishes from public
//      browse → reactivate → it returns.
// All scratch rows are removed at the end. No hard deletes of history.
// Usage: cd apps/api && JOBS_DISABLED=true node --env-file=../../.env scripts/demo-phase85.mjs
import { NestFactory, Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { StaffService } from '../dist/staff/staff.service.js';
import { AdminService } from '../dist/admin/admin.service.js';
import { ListingsService } from '../dist/listings/listings.service.js';
import { AgencyGuard } from '../dist/auth/agency.guard.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
const prisma = app.get(PrismaService);
const staff = app.get(StaffService);
const admin = app.get(AdminService);
const listings = app.get(ListingsService);
const guard = new AgencyGuard(prisma, app.get(Reflector));

const ok = (s) => console.log(`   ✓ ${s}`);
let failed = false;
const must = (cond, s) => { if (cond) ok(s); else { failed = true; console.error(`   ✗ ${s}`); } };

// The ExecutionContext the guard reads (an agency route with no specific role).
const ctxFor = (userId) => ({
  switchToHttp: () => ({ getRequest: () => ({ user: { sub: userId }, headers: {} }) }),
  getHandler: () => function h() {},
  getClass: () => class C {},
});
const guardAllows = async (userId) => {
  try { return await guard.canActivate(ctxFor(userId)); } catch { return false; }
};
const browseCount = async () => (await listings.publicList({ page: 1 })).total;

// ── scratch fixtures ─────────────────────────────────────────────────────────
const stamp = Date.now();
const cleanup = { users: [], members: [], listings: [], owners: [], agencies: [] };

// A scratch agency (so we can suspend/reactivate without touching real ones),
// its head, a worker, an owner, and a published+available listing.
const agency = await prisma.agency.create({
  data: { name: `Deactivation Demo ${stamp}`, phone: '+252619000000', districts: ['Hodan'], status: 'active' },
});
cleanup.agencies.push(agency.id);

const head = await prisma.user.create({ data: { name: 'Demo Head', email: `demo.head.${stamp}@guri.test`, clerkUserId: `ck_head_${stamp}` } });
const worker = await prisma.user.create({ data: { name: 'Demo Worker', email: `demo.worker.${stamp}@guri.test`, clerkUserId: `ck_worker_${stamp}` } });
const ownerUser = await prisma.user.create({ data: { name: 'Demo Owner', email: `demo.owner.${stamp}@guri.test` } });
cleanup.users.push(head.id, worker.id, ownerUser.id);

const headM = await prisma.agencyMember.create({ data: { userId: head.id, agencyId: agency.id, role: 'admin', canVerify: true } });
const workerM = await prisma.agencyMember.create({ data: { userId: worker.id, agencyId: agency.id, role: 'agent' } });
cleanup.members.push(headM.id, workerM.id);

const owner = await prisma.owner.create({ data: { userId: ownerUser.id, agencyId: agency.id, createdById: head.id, inviteStatus: 'claimed' } });
cleanup.owners.push(owner.id);
const listing = await prisma.listing.create({
  data: {
    agencyId: agency.id, ownerId: owner.id, district: 'Hodan', neighborhood: 'Taleex', type: 'house',
    bedrooms: 3, bathrooms: 2, rentUsd: 555, depositUsd: 555, descriptionSo: 'x', descriptionEn: 'x',
    photos: [`photos/demo/${randomUUID()}.webp`], originalsVerified: true, status: 'available', publishedAt: new Date(),
  },
});
cleanup.listings.push(listing.id);
const ctx = { agencyId: agency.id, roles: ['admin'], canVerify: true };

try {
  console.log('\n=== 1. Head removes a worker → guard 403 → reactivate → restored ===');
  must(await guardAllows(worker.id), 'worker can access the console (guard allows)');
  await staff.patch(ctx, head.id, worker.id, { active: false });
  must((await guardAllows(worker.id)) === false, 'after REMOVE: worker is 403 at the guard on the next request');
  must(await guardAllows(head.id), 'the head still has access (only the worker was removed)');
  await staff.patch(ctx, head.id, worker.id, { active: true });
  must(await guardAllows(worker.id), 'after REACTIVATE: worker access restored');
  // the worker's users row + membership row still exist (deactivate, not destroy)
  const stillThere = await prisma.agencyMember.findFirst({ where: { userId: worker.id, agencyId: agency.id } });
  must(!!stillThere, 'the membership row was never deleted — history intact');

  console.log('\n=== 2. Admin suspends the agency → listing leaves browse → reactivate → returns ===');
  const before = await browseCount();
  must(before >= 1, `listing is publicly browseable (browse total ${before})`);
  const visibleNow = (await listings.publicList({ page: 1, district: 'Hodan' })).items.some((i) => i.id === listing.id);
  must(visibleNow, 'the scratch listing appears in public browse');

  await admin.patchAgency(head.id, agency.id, { status: 'suspended' });
  const afterSuspend = await browseCount();
  must(afterSuspend === before - 1, `after SUSPEND: browse total ${before} → ${afterSuspend} (listing vanished)`);
  const goneNow = (await listings.publicList({ page: 1, district: 'Hodan' })).items.some((i) => i.id === listing.id);
  must(!goneNow, 'the suspended agency’s listing is gone from browse/search');
  // suspension also blocks the agency's staff at the guard
  must((await guardAllows(head.id)) === false, 'suspended agency: even the head is 403 at the guard');
  // …but the lease/listing rows are untouched (readable by owner/tenant paths)
  const listingStillExists = await prisma.listing.findUnique({ where: { id: listing.id } });
  must(!!listingStillExists, 'the listing row still exists (suspension hides, never deletes)');

  await admin.patchAgency(head.id, agency.id, { status: 'active' });
  const afterReactivate = await browseCount();
  must(afterReactivate === before, `after REACTIVATE: browse total back to ${afterReactivate} (listing returned)`);
  must(await guardAllows(head.id), 'reactivated agency: the head can access the console again');

  console.log('\n=== 3. Every revocation left an audit_log row ===');
  const audits = await prisma.auditLog.findMany({
    where: { OR: [{ objectId: { in: [worker.id, agency.id] } }, { actorId: head.id }] },
    select: { action: true },
  });
  const actions = new Set(audits.map((a) => a.action));
  for (const need of ['staff.deactivated', 'staff.reactivated', 'agency.suspended', 'agency.active']) {
    must(actions.has(need), `audit_log has "${need}"`);
  }

  console.log(`\nRESULT: ${failed ? 'FAIL' : 'PASS'} — access revoked at the guard, history retained, reversible (§17)`);
} catch (e) {
  failed = true;
  console.error('demo threw:', e?.stack ?? e);
} finally {
  console.log('\ncleaning up scratch rows…');
  await prisma.auditLog.deleteMany({ where: { OR: [{ objectId: { in: [worker.id, agency.id, ...cleanup.listings, ...cleanup.owners] } }, { actorId: { in: cleanup.users } }] } }).catch(() => {});
  await prisma.listing.deleteMany({ where: { id: { in: cleanup.listings } } }).catch(() => {});
  await prisma.owner.deleteMany({ where: { id: { in: cleanup.owners } } }).catch(() => {});
  await prisma.agencyMember.deleteMany({ where: { id: { in: cleanup.members } } }).catch(() => {});
  await prisma.agency.deleteMany({ where: { id: { in: cleanup.agencies } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: cleanup.users } } }).catch(() => {});
  console.log('   done.');
  await app.close();
  process.exit(failed ? 1 : 0);
}
