import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seeds the bootstrap account from SEED_EMAIL / SEED_PASSWORD. Idempotent: if
 * the user already exists, it does nothing. Registration is the normal path for
 * additional accounts — this exists so the very first one can be created before
 * anyone can sign in.
 */
async function main() {
  const email = process.env.SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_PASSWORD;
  if (!email || !password) {
    throw new Error('Set SEED_EMAIL and SEED_PASSWORD in .env to seed the account.');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists — nothing to do.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { email, passwordHash } });
  console.log(`Created user ${user.email} (${user.id}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
