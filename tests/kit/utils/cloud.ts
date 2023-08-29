import { faker } from '@faker-js/faker';
import { hash } from '@node-rs/argon2';
import type { BrowserContext, Cookie } from '@playwright/test';

export async function getLoginCookie(
  context: BrowserContext
): Promise<Cookie | undefined> {
  return (await context.cookies()).find(
    c => c.name === 'next-auth.session-token'
  );
}

export async function createRandomUser() {
  const user = {
    name: faker.internet.userName(),
    email: faker.internet.email().toLowerCase(),
    password: '123456',
  };
  const {
    PrismaClient,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
  } = require('../../../apps/server/node_modules/@prisma/client');
  const client = new PrismaClient();
  await client.$connect();
  await client.user.create({
    data: {
      ...user,
      emailVerified: new Date(),
      password: await hash(user.password),
    },
  });
  await client.$disconnect();

  return client.user.findUnique({
    where: {
      email: user.email,
    },
  });
}

export async function deleteUser(email: string) {
  const {
    PrismaClient,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
  } = require('../../../apps/server/node_modules/@prisma/client');
  const client = new PrismaClient();
  await client.$connect();
  await client.user.delete({
    where: {
      email,
    },
  });
  await client.$disconnect();
}
