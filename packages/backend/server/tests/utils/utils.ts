import { randomUUID } from 'node:crypto';

import { TestingModule } from '@nestjs/testing';
import { hashSync } from '@node-rs/argon2';
import { PrismaClient, type User } from '@prisma/client';

import { RevertCommand, RunCommand } from '../../src/data/commands/run';

export async function flushDB() {
  const client = new PrismaClient();
  await client.$connect();
  const result: { tablename: string }[] =
    await client.$queryRaw`SELECT tablename
                           FROM pg_catalog.pg_tables
                           WHERE schemaname != 'pg_catalog'
                             AND schemaname != 'information_schema'`;

  // remove all table data
  await client.$executeRawUnsafe(
    `TRUNCATE TABLE ${result
      .map(({ tablename }) => tablename)
      .filter(name => !name.includes('migrations'))
      .join(', ')}`
  );

  await client.$disconnect();
}

export class FakePrisma {
  fakeUser: User = {
    id: randomUUID(),
    name: 'Alex Yang',
    avatarUrl: '',
    email: 'alex.yang@example.org',
    password: hashSync('123456'),
    emailVerified: new Date(),
    createdAt: new Date(),
  };

  get user() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const prisma = this;
    return {
      async findFirst() {
        return prisma.fakeUser;
      },
      async findUnique() {
        return this.findFirst();
      },
      async update() {
        return this.findFirst();
      },
    };
  }
}

export async function initFeatureConfigs(module: TestingModule) {
  const run = module.get(RunCommand);
  const revert = module.get(RevertCommand);
  await Promise.allSettled([revert.run(['UserFeaturesInit1698652531198'])]);
  await run.runOne('UserFeaturesInit1698652531198');
}
