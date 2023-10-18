import userA from '@affine-test/fixtures/userA.json' assert { type: 'json' };
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.user.create({
    data: {
      ...userA,
      password: await hash(userA.password),
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
