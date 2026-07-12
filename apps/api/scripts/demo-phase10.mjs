// Phase-10 demo (§15 owner-initiated intake): a customer (existing account)
// submits their house to Karan Realty → Karan sees the lead → accepts →
// converts → the agency publishes through the NORMAL path → the house appears
// in public browse for the FIRST time. At every step before that publish we
// re-run the public browse and prove the house is INVISIBLE (rule 6). Real
// services + live DB; all scratch rows removed at the end.
// Usage: cd apps/api && JOBS_DISABLED=true node --env-file=../../.env scripts/demo-phase10.mjs
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { IntakesService } from '../dist/intakes/intakes.service.js';
import { ListingsService } from '../dist/listings/listings.service.js';
import { AgenciesDirectoryService } from '../dist/intakes/agencies-directory.service.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
const prisma = app.get(PrismaService);
const intakes = app.get(IntakesService);
const listings = app.get(ListingsService);
const directory = app.get(AgenciesDirectoryService);

const line = (s) => console.log(s);
const ok = (s) => console.log(`   ✓ ${s}`);
let failed = false;
const must = (cond, s) => { if (cond) ok(s); else { failed = true; console.error(`   ✗ ${s}`); } };

// count how many published homes are publicly browseable right now
const browseCount = async () => (await listings.publicList({ page: 1 })).total;
// is a given listing id publicly visible?
const isPublic = async (id) => {
  try { await listings.publicDetail(id); return true; } catch { return false; }
};

const agency = await prisma.agency.findFirstOrThrow({ where: { name: 'Karan Realty' } });
const agent = await prisma.agencyMember.findFirstOrThrow({ where: { agencyId: agency.id, active: true } });
const ctx = { agencyId: agency.id, roles: [agent.role], canVerify: agent.canVerify };
const photo = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#173a31' } }).jpeg().toBuffer();
const district = agency.districts[0]; // a district Karan Realty actually serves

// A fresh "customer" account (no owner role yet) — the person bringing a house.
const customer = await prisma.user.create({
  data: { name: 'Demo Owner (phase10)', phone: '+252612345678', locale: 'so', email: `demo.owner.${Date.now()}@guri.test` },
});
const cleanup = { intakeIds: [], listingIds: [], ownerIds: [], userIds: [customer.id] };

try {
  line('\n=== 1. Public agency directory (§15) ===');
  const dir = await directory.list(district);
  const karan = dir.find((a) => a.id === agency.id);
  must(!!karan, `directory lists Karan Realty for its district (${karan?.liveListings} live listings)`);
  must(dir.every((a) => a.status !== 'pending'), 'only active agencies appear');

  const before = await browseCount();
  line(`\n=== 2. Baseline public browse = ${before} homes ===`);

  line('\n=== 3. Customer submits their house to Karan Realty ===');
  const submitted = await intakes.submit(
    customer.id,
    { agencyId: agency.id, district, neighborhood: 'Taleex', type: 'house', bedrooms: 4, bathrooms: 3, expectedRentUsd: 650, notes: 'Owner-submitted via directory' },
    { photos: [{ buffer: photo }], docs: [{ buffer: Buffer.from('title-deed'), originalname: 'deed.pdf', mimetype: 'application/pdf' }] },
  );
  cleanup.intakeIds.push(submitted.id);
  ok(`intake ${submitted.id.slice(0, 8)} is '${submitted.status}'`);
  const me = await prisma.user.findUnique({
    where: { id: customer.id },
    include: { ownerProfiles: true, intakes: { take: 1 } },
  });
  must(me.intakes.length === 1 && me.ownerProfiles.length === 0, 'submitting granted the OWNER role with NO agency tie yet (rule 15)');
  must((await browseCount()) === before, 'INVISIBLE in public browse after submit');
  must(!(await isPublic(submitted.listingId ?? 'none')), 'no public listing exists for the intake');

  line('\n=== 4. Karan Realty sees the lead in its inbox ===');
  const inbox = await intakes.agencyIntakes(ctx);
  must(inbox.some((i) => i.id === submitted.id), `lead visible to Karan (owner ${inbox.find((i) => i.id === submitted.id)?.ownerName}, ${inbox.find((i) => i.id === submitted.id)?.ageDays}d old)`);
  // scoping: another agency cannot see it
  const otherAgency = await prisma.agency.findFirst({ where: { status: 'active', id: { not: agency.id } } });
  if (otherAgency) {
    const otherInbox = await intakes.agencyIntakes({ agencyId: otherAgency.id, roles: ['admin'], canVerify: true });
    must(!otherInbox.some((i) => i.id === submitted.id), 'a DIFFERENT agency cannot see the lead (rule 3)');
  }

  line('\n=== 5. Karan accepts → owner gets the agency contact ===');
  await intakes.accept(ctx, agent.userId, submitted.id);
  const mine = (await intakes.myIntakes(customer.id))[0];
  must(mine.status === 'accepted' && mine.agency?.phone, `owner now sees agency contact ${mine.agency?.phone}`);
  must((await browseCount()) === before, 'STILL invisible in public browse after accept');

  line('\n=== 6. Karan converts after the meetup → draft listing + permanent tie ===');
  const { listing } = await intakes.convert(ctx, agent.userId, submitted.id);
  cleanup.listingIds.push(listing.id);
  const ownerRow = await prisma.owner.findFirst({ where: { userId: customer.id, agencyId: agency.id } });
  cleanup.ownerIds.push(ownerRow.id);
  ok(`intake converted; draft listing ${listing.id.slice(0, 8)} created, prefilled (${listing.district}, ${listing.bedrooms}bd, ${listing.photos.length} photo)`);
  must(!!ownerRow, 'owner is now PERMANENTLY linked to Karan Realty (tie starts at conversion)');
  must((await browseCount()) === before, 'STILL invisible: a converted-but-unpublished draft is not public');
  must(!(await isPublic(listing.id)), 'the draft listing has no public detail page yet');
  // tie is permanent → reassign is refused
  let reassignBlocked = false;
  try { await intakes.reassign(customer.id, submitted.id, otherAgency?.id ?? agency.id); } catch { reassignBlocked = true; }
  must(reassignBlocked, 'owner can no longer reassign after conversion (tie is permanent)');

  line('\n=== 7. Agency completes originals + publishes via the NORMAL path ===');
  await prisma.listing.update({ where: { id: listing.id }, data: { originalsVerified: true } }); // agency ticks at meetup
  await listings.publish(ctx, agent.userId, listing.id);
  const after = await browseCount();
  must(after === before + 1, `house now PUBLIC for the first time (browse ${before} → ${after})`);
  must(await isPublic(listing.id), 'the listing has a public detail page');
  const published = await listings.publicList({ page: 1, district });
  must(published.items.some((i) => i.id === listing.id), 'the converted house appears in public browse/search');
  const ownerNotified = await prisma.notification.findFirst({ where: { userId: customer.id, template: 'intake_published' } });
  must(!!ownerNotified, 'owner was notified their house is now live (§7)');

  line(`\nRESULT: ${failed ? 'FAIL' : 'PASS'} — invisible at submit/accept/convert, public only after publish (§15/rule 6)`);
} catch (e) {
  failed = true;
  console.error('demo threw:', e?.stack ?? e);
} finally {
  line('\ncleaning up scratch rows…');
  await prisma.notification.deleteMany({ where: { userId: { in: cleanup.userIds } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { OR: [
    { objectId: { in: [...cleanup.intakeIds, ...cleanup.listingIds] } },
    { actorId: { in: cleanup.userIds } },
  ] } }).catch(() => {});
  await prisma.intake.deleteMany({ where: { id: { in: cleanup.intakeIds } } }).catch(() => {});
  await prisma.listing.deleteMany({ where: { id: { in: cleanup.listingIds } } }).catch(() => {});
  await prisma.owner.deleteMany({ where: { id: { in: cleanup.ownerIds } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: cleanup.userIds } } }).catch(() => {});
  line('   done.');
  await app.close();
  process.exit(failed ? 1 : 0);
}
