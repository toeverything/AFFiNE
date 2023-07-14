/// <reference types="../global.d.ts" />
import { ok } from 'node:assert';
import { afterEach, beforeEach, test } from 'node:test';

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { ConfigModule } from '../config';
import { GqlModule } from '../graphql.module';
import { MetricsModule } from '../metrics';
import { AuthModule } from '../modules/auth';
import { AuthService } from '../modules/auth/service';
import { PrismaModule } from '../prisma';

let auth: AuthService;
let module: TestingModule;

// cleanup database before each test
beforeEach(async () => {
  const client = new PrismaClient();
  await client.$connect();
  await client.user.deleteMany({});
});

beforeEach(async () => {
  module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        auth: {
          accessTokenExpiresIn: 1,
          refreshTokenExpiresIn: 1,
          leeway: 1,
        },
      }),
      PrismaModule,
      GqlModule,
      AuthModule,
      MetricsModule,
    ],
  }).compile();
  auth = module.get(AuthService);
});

afterEach(async () => {
  await module.close();
});

test('should be able to register and signIn', async () => {
  await auth.signUp('Alex Yang', 'alexyang@example.org', '123456');
  await auth.signIn('alexyang@example.org', '123456');
});

test('should be able to verify', async () => {
  await auth.signUp('Alex Yang', 'alexyang@example.org', '123456');
  await auth.signIn('alexyang@example.org', '123456');
  const user = {
    id: '1',
    name: 'Alex Yang',
    email: 'alexyang@example.org',
    createdAt: new Date(),
  };
  {
    const token = await auth.sign(user);
    const claim = await auth.verify(token);
    ok(claim.id === '1');
    ok(claim.name === 'Alex Yang');
    ok(claim.email === 'alexyang@example.org');
  }
  {
    const token = await auth.refresh(user);
    const claim = await auth.verify(token);
    ok(claim.id === '1');
    ok(claim.name === 'Alex Yang');
    ok(claim.email === 'alexyang@example.org');
  }
});
