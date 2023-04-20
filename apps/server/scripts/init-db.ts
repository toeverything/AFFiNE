import { randomUUID } from 'node:crypto';

import userA from '@affine-test/fixtures/userA.json' assert { type: 'json' };
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.users.create({
    data: {
      id: randomUUID(),
      ...userA,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async e => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
