// Dev-only test fixture (NOT for production). Turns an existing Clerk-linked
// account into a full test user so every console can be exercised from one
// sign-in (rule 15: one account, many roles, role switcher):
//   - platform admin  (users.is_platform_admin — the DB grant §2 allows)
//   - agency admin     with can_verify (agency_members)
//   - owner            (owners, invite claimed)
//   - customer         (implicit)
// plus a realistic owner portfolio: one agency, two tenants, three listings,
// two live leases, and payments across recent months so the dashboard chart,
// recent-payments, and income ledger all have real data to render.
//
// It respects the architecture: auth stays Clerk (this only touches local
// rows the webhook/guard already own), and listings.status is written to the
// SAME value the state machine derives from each lease — never an invented one.
// Idempotent: re-running wipes only this agency's portfolio and rebuilds it.
//
// Usage (from apps/api): node --env-file=../../.env scripts/seed-testdata.mjs [email]
import { PrismaClient } from '@prisma/client';

if (process.env.NODE_ENV === 'production') {
  console.error('refusing to run: NODE_ENV=production');
  process.exit(1);
}

const AGENCY_NAME = 'Hoygaaga Realty';
const email = (process.argv[2] ?? 'bashiirmuhamed@gmail.com').trim().toLowerCase();
const prisma = new PrismaClient();

const monthsAgo = (n, day = 4) => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() - n, day));
};
const addMonths = (date, n) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
};

// 1) The test account — must already exist (linked to Clerk on first sign-in).
const mainUser = await prisma.user.upsert({
  where: { email },
  create: { email, name: 'Test Owner', isPlatformAdmin: true },
  update: { isPlatformAdmin: true },
});
if (!mainUser.name) {
  await prisma.user.update({ where: { id: mainUser.id }, data: { name: 'Cabdullahi Yusuf' } });
}
console.log(`test account: ${email} (${mainUser.id})${mainUser.clerkUserId ? '' : '  [not yet signed in — links by email on first Clerk sign-in]'}`);

// 2) Agency (findFirst by name — name is not unique in the schema).
let agency = await prisma.agency.findFirst({ where: { name: AGENCY_NAME } });
if (!agency) {
  agency = await prisma.agency.create({
    data: {
      name: AGENCY_NAME,
      phone: '+252613111222',
      status: 'active',
      districts: ['Hodan', 'Wadajir', 'Yaaqshiid', 'Hamar Weyne', 'Waaberi'],
    },
  });
} else {
  agency = await prisma.agency.update({
    where: { id: agency.id },
    data: { status: 'active', districts: ['Hodan', 'Wadajir', 'Yaaqshiid', 'Hamar Weyne', 'Waaberi'] },
  });
}

// 3) Roles for the test account (idempotent upserts on their unique keys).
await prisma.agencyMember.upsert({
  where: { userId_agencyId_role: { userId: mainUser.id, agencyId: agency.id, role: 'admin' } },
  create: { userId: mainUser.id, agencyId: agency.id, role: 'admin', canVerify: true, active: true },
  update: { canVerify: true, active: true },
});
await prisma.owner.upsert({
  where: { userId_agencyId: { userId: mainUser.id, agencyId: agency.id } },
  create: {
    userId: mainUser.id,
    agencyId: agency.id,
    createdById: mainUser.id,
    inviteStatus: 'claimed',
  },
  update: { inviteStatus: 'claimed' },
});
const owner = await prisma.owner.findUnique({
  where: { userId_agencyId: { userId: mainUser.id, agencyId: agency.id } },
});

// 4) Tenant users (contact-only rows, no Clerk credential — rule 14).
const tenants = {};
for (const [key, tEmail, name, phone] of [
  ['layla', 'layla.axmed@example.so', 'Layla Axmed', '+252615000111'],
  ['cumar', 'cumar.faarax@example.so', 'Cumar Faarax', '+252615000222'],
]) {
  tenants[key] = await prisma.user.upsert({
    where: { email: tEmail },
    create: { email: tEmail, name, phone },
    update: { name, phone },
  });
}

// 5) Wipe THIS agency's portfolio so the seed is repeatable (children first).
await prisma.payment.deleteMany({ where: { lease: { listing: { agencyId: agency.id } } } });
await prisma.lease.deleteMany({ where: { listing: { agencyId: agency.id } } });
await prisma.customerDocument.deleteMany({ where: { deal: { listing: { agencyId: agency.id } } } });
await prisma.agreement.deleteMany({ where: { deal: { listing: { agencyId: agency.id } } } });
await prisma.dealEvent.deleteMany({ where: { deal: { listing: { agencyId: agency.id } } } });
await prisma.deal.deleteMany({ where: { listing: { agencyId: agency.id } } });
await prisma.ownerDocument.deleteMany({ where: { listing: { agencyId: agency.id } } });
await prisma.listing.deleteMany({ where: { agencyId: agency.id } });

// 6) Listings + leases + payments. Each listing's `status` is set to the value
// the state machine derives from its lease (rented when a live lease exists,
// otherwise available) — a fixture mirroring the rule, not bypassing it.
const base = {
  agencyId: agency.id,
  ownerId: owner.id,
  photos: [],
  originalsVerified: true,
  publishedAt: monthsAgo(14, 1),
};

async function makeRented({ listing, tenant, leaseStartMonthsAgo, termMonths, monthlyPayments }) {
  const created = await prisma.listing.create({
    data: { ...base, ...listing, status: 'rented' },
  });
  const startDate = monthsAgo(leaseStartMonthsAgo, 1);
  const lease = await prisma.lease.create({
    data: {
      listingId: created.id,
      customerId: tenant.id,
      startDate,
      termMonths,
      endDate: addMonths(startDate, termMonths),
      rentUsd: listing.rentUsd,
      depositUsd: listing.depositUsd,
      status: 'active',
    },
  });
  // Deposit at move-in, then monthly rent for the last N months incl. this one.
  await prisma.payment.create({
    data: {
      leaseId: lease.id,
      type: 'deposit',
      amountUsd: listing.depositUsd,
      paidOn: startDate,
      recordedById: mainUser.id,
      note: 'Move-in deposit',
    },
  });
  for (let i = monthlyPayments - 1; i >= 0; i--) {
    await prisma.payment.create({
      data: {
        leaseId: lease.id,
        type: 'monthly_rent',
        amountUsd: listing.rentUsd,
        paidOn: monthsAgo(i, i === 0 ? 3 : 4),
        recordedById: mainUser.id,
      },
    });
  }
  return created;
}

await makeRented({
  listing: {
    district: 'Hodan',
    neighborhood: 'Taleex',
    type: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 78,
    rentUsd: '350',
    depositUsd: '350',
    descriptionSo: 'Aqal dabaq labaad oo iftiin badan, dhulka waa tayl, jikada waa mid casri ah.',
    descriptionEn: 'Bright second-floor 2-bedroom apartment, tiled floors, modern kitchen.',
  },
  tenant: tenants.layla,
  leaseStartMonthsAgo: 10,
  termMonths: 12,
  monthlyPayments: 6,
});

await makeRented({
  listing: {
    district: 'Wadajir',
    neighborhood: 'Birta Dhagax',
    type: 'villa',
    bedrooms: 4,
    bathrooms: 3,
    areaSqm: 210,
    rentUsd: '900',
    depositUsd: '900',
    descriptionSo: 'Villa weyn oo 4 qol ah oo Wadajir ku taal.',
    descriptionEn: 'Spacious 4-bedroom villa in Wadajir.',
  },
  tenant: tenants.cumar,
  leaseStartMonthsAgo: 16,
  termMonths: 12,
  monthlyPayments: 6,
});

// Available listings — these are what public browse shows (§6). A few, in
// different districts, so the browse grid looks like the design's multi-card list.
const available = [
  {
    district: 'Yaaqshiid',
    neighborhood: 'Suuqa Bakaaraha',
    type: 'house',
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 95,
    rentUsd: '220',
    depositUsd: '220',
    descriptionSo: 'Guri 2 qol oo Yaaqshiid ku yaal, diyaar u ah kiro.',
    descriptionEn: '2-bedroom house in Yaaqshiid, available to rent.',
  },
  {
    district: 'Hamar Weyne',
    neighborhood: 'Xamar Weyne',
    type: 'room',
    bedrooms: 1,
    bathrooms: 1,
    areaSqm: 28,
    rentUsd: '180',
    depositUsd: '180',
    descriptionSo: 'Qol keli ah oo Xamar Weyne ku yaal, qiimo jaban.',
    descriptionEn: 'Single room in Hamar Weyne, budget-friendly.',
  },
  {
    district: 'Waaberi',
    neighborhood: 'Taleex',
    type: 'apartment',
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 120,
    rentUsd: '500',
    depositUsd: '500',
    descriptionSo: 'Aqal 3 qol oo Waaberi ku yaal, nadiif oo iftiin badan.',
    descriptionEn: 'Bright 3-bedroom apartment in Waaberi.',
  },
];
for (const listing of available) {
  await prisma.listing.create({ data: { ...base, ...listing, status: 'available' } });
}

const [listings, leases, payments] = await Promise.all([
  prisma.listing.count({ where: { agencyId: agency.id } }),
  prisma.lease.count({ where: { listing: { agencyId: agency.id } } }),
  prisma.payment.count({ where: { lease: { listing: { agencyId: agency.id } } } }),
]);
console.log(`agency: ${agency.name} (${agency.id})`);
console.log(`roles granted: platform-admin, agency-admin(can_verify), owner`);
console.log(`portfolio: ${listings} listings, ${leases} live leases, ${payments} payments`);
console.log('done. sign in with the email above to see it.');

await prisma.$disconnect();
