import { ok, throws } from 'node:assert';
import { beforeEach, test } from 'node:test';

import { UnauthorizedException } from '@nestjs/common';
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

// cleanup database before each test
beforeEach(async () => {
  const client = new PrismaClient();
  await client.$connect();
  await client.user.deleteMany({});
});

beforeEach(async () => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        auth: {
          accessTokenExpiresIn: '1s',
          refreshTokenExpiresIn: '3s',
        },
      }),
      PrismaModule,
      GqlModule,
      AuthModule,
    ],
  }).compile();
  auth = module.get(AuthService);
});

async function sleep(ms: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });
}

test('should be able to register and signIn', async () => {
  await auth.register('Alex Yang', 'alexyang@example.org', '123456');
  await auth.signIn('alexyang@example.org', '123456');
});

test('should be able to verify', async () => {
  await auth.register('Alex Yang', 'alexyang@example.org', '123456');
  await auth.signIn('alexyang@example.org', '123456');
  const user = {
    id: '1',
    name: 'Alex Yang',
    email: 'alexyang@example.org',
  };
  {
    const token = auth.sign(user);
    const clain = auth.verify(token);
    ok(clain.id === '1');
    ok(clain.name === 'Alex Yang');
    ok(clain.email === 'alexyang@example.org');
    await sleep(1050);
    throws(() => auth.verify(token), UnauthorizedException, 'Invalid token');
  }
  {
    const token = auth.refresh(user);
    const clain = auth.verify(token);
    ok(clain.id === '1');
    ok(clain.name === 'Alex Yang');
    ok(clain.email === 'alexyang@example.org');
    await sleep(3050);
    throws(() => auth.verify(token), UnauthorizedException, 'Invalid token');
  }
});
