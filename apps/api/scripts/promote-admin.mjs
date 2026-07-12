// Bootstraps the first platform admin (there is no UI path to the first one).
// Keys off EMAIL — the Clerk credential. If the user hasn't signed in yet, a
// placeholder row is created and the Clerk webhook links it on first sign-in.
// Usage: pnpm --filter @guri/api admin:promote -- someone@example.com
import { PrismaClient } from '@prisma/client';

const email = (process.argv[2] ?? '').trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('usage: pnpm --filter @guri/api admin:promote -- <email>');
  process.exit(1);
}

const prisma = new PrismaClient();
const user = await prisma.user.upsert({
  where: { email },
  create: { email, isPlatformAdmin: true },
  update: { isPlatformAdmin: true },
});
console.log(`platform admin: ${user.email} (${user.id})`);
await prisma.$disconnect();
