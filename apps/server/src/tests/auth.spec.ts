import { beforeEach, test } from 'node:test';

import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { ConfigModule } from '../config';
import { getDefaultAFFiNEConfig } from '../config/default';
import { GqlModule } from '../graphql.module';
import { AuthModule } from '../modules/auth';
import { AuthService } from '../modules/auth/service';
import { PrismaModule } from '../prisma';

globalThis.AFFiNE = getDefaultAFFiNEConfig();

let auth: AuthService;

beforeEach(async () => {
  const client = new PrismaClient();
  await client.$connect();
  await client.user.deleteMany({});

  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot(), PrismaModule, GqlModule, AuthModule],
  }).compile();
  auth = module.get(AuthService);
});

test('should be able to sign and verify token', async () => {
  await auth.register('Alex Yang', 'alexyang@example.org', '123456');
  await auth.signIn('alexyang@example.org', '123456');
});
