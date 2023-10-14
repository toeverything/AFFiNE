/// <reference types="../src/global.d.ts" />
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import test from 'ava';

import { ConfigModule } from '../src/config';
import { GqlModule } from '../src/graphql.module';
import { MetricsModule } from '../src/metrics';
import { AuthModule } from '../src/modules/auth';
import { AuthResolver } from '../src/modules/auth/resolver';
import { AuthService } from '../src/modules/auth/service';
import { PrismaModule } from '../src/prisma';
import { mintChallengeResponse, verifyChallengeResponse } from '../src/storage';
import { RateLimiterModule } from '../src/throttler';

let authService: AuthService;
let authResolver: AuthResolver;
let module: TestingModule;

// cleanup database before each test
test.beforeEach(async () => {
  const client = new PrismaClient();
  await client.$connect();
  await client.user.deleteMany({});
  await client.$disconnect();
});

test.beforeEach(async () => {
  module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        auth: {
          accessTokenExpiresIn: 1,
          refreshTokenExpiresIn: 1,
          leeway: 1,
        },
        host: 'example.org',
        https: true,
      }),
      PrismaModule,
      GqlModule,
      AuthModule,
      MetricsModule,
      RateLimiterModule,
    ],
  }).compile();
  authService = module.get(AuthService);
  authResolver = module.get(AuthResolver);
});

test.afterEach.always(async () => {
  await module.close();
});

test('should be able to register and signIn', async t => {
  await authService.signUp('Alex Yang', 'alexyang@example.org', '123456');
  await authService.signIn('alexyang@example.org', '123456');
  t.pass();
});

test('should be able to verify', async t => {
  await authService.signUp('Alex Yang', 'alexyang@example.org', '123456');
  await authService.signIn('alexyang@example.org', '123456');
  const date = new Date();

  const user = {
    id: '1',
    name: 'Alex Yang',
    email: 'alexyang@example.org',
    emailVerified: date,
    createdAt: date,
    avatarUrl: '',
  };
  {
    const token = await authService.sign(user);
    const claim = await authService.verify(token);
    t.is(claim.id, '1');
    t.is(claim.name, 'Alex Yang');
    t.is(claim.email, 'alexyang@example.org');
    t.is(claim.emailVerified?.toISOString(), date.toISOString());
    t.is(claim.createdAt.toISOString(), date.toISOString());
  }
  {
    const token = await authService.refresh(user);
    const claim = await authService.verify(token);
    t.is(claim.id, '1');
    t.is(claim.name, 'Alex Yang');
    t.is(claim.email, 'alexyang@example.org');
    t.is(claim.emailVerified?.toISOString(), date.toISOString());
    t.is(claim.createdAt.toISOString(), date.toISOString());
  }
});

test('should not be able to return token if user is invalid', async t => {
  const date = new Date();
  const user = {
    id: '1',
    name: 'Alex Yang',
    email: 'alexyang@example.org',
    emailVerified: date,
    createdAt: date,
    avatarUrl: '',
  };
  const anotherUser = {
    id: '2',
    name: 'Alex Yang 2',
    email: 'alexyang@example.org',
    emailVerified: date,
    createdAt: date,
    avatarUrl: '',
  };
  await t.throwsAsync(
    authResolver.token(
      {
        req: {
          headers: {
            referer: 'https://example.org',
            host: 'example.org',
          },
        } as any,
      },
      user,
      anotherUser
    ),
    {
      message: 'Invalid user',
    }
  );
});

test('should not return sessionToken if request headers is invalid', async t => {
  const date = new Date();
  const user = {
    id: '1',
    name: 'Alex Yang',
    email: 'alexyang@example.org',
    emailVerified: date,
    createdAt: date,
    avatarUrl: '',
  };
  const result = await authResolver.token(
    {
      req: {
        headers: {},
      } as any,
    },
    user,
    user
  );
  t.is(result.sessionToken, undefined);
});

test('should return valid sessionToken if request headers valid', async t => {
  const date = new Date();
  const user = {
    id: '1',
    name: 'Alex Yang',
    email: 'alexyang@example.org',
    emailVerified: date,
    createdAt: date,
    avatarUrl: '',
  };
  const result = await authResolver.token(
    {
      req: {
        headers: {
          referer: 'https://example.org/open-app/test',
          host: 'example.org',
        },
        cookies: {
          'next-auth.session-token': '123456',
        },
      } as any,
    },
    user,
    user
  );
  t.is(result.sessionToken, '123456');
});

test('verify challenge', async t => {
  const resource = 'xp8D3rcXV9bMhWrb6abxl';
  const response = await mintChallengeResponse(resource, 20);
  const success = await verifyChallengeResponse(response, 20, resource);
  t.true(success);
});
