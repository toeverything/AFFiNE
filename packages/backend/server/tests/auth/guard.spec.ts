import { Controller, Get, HttpStatus, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';
import request from 'supertest';

import {
  AuthGuard,
  AuthModule,
  CurrentUser,
  Public,
} from '../../src/core/auth';
import { AuthService } from '../../src/core/auth/service';
import { createTestingApp } from '../utils';

@Controller('/')
class TestController {
  @Public()
  @Get('/public')
  home(@CurrentUser() user?: CurrentUser) {
    return { user };
  }

  @Get('/private')
  private(@CurrentUser() user: CurrentUser) {
    return { user };
  }
}

const test = ava as TestFn<{
  app: INestApplication;
  auth: Sinon.SinonStubbedInstance<AuthService>;
}>;

test.beforeEach(async t => {
  const { app } = await createTestingApp({
    imports: [AuthModule],
    providers: [
      {
        provide: APP_GUARD,
        useClass: AuthGuard,
      },
    ],
    controllers: [TestController],
    tapModule: m => {
      m.overrideProvider(AuthService).useValue(
        Sinon.createStubInstance(AuthService)
      );
    },
  });

  t.context.auth = app.get(AuthService);
  t.context.app = app;
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('should be able to visit public api if not signed in', async t => {
  const { app } = t.context;

  const res = await request(app.getHttpServer()).get('/public').expect(200);

  t.is(res.body.user, undefined);
});

test('should be able to visit public api if signed in', async t => {
  const { app, auth } = t.context;

  // @ts-expect-error mock
  auth.getUser.resolves({ id: '1' });

  const res = await request(app.getHttpServer())
    .get('/public')
    .set('Cookie', 'sid=1')
    .expect(HttpStatus.OK);

  t.is(res.body.user.id, '1');
});

test('should not be able to visit private api if not signed in', async t => {
  const { app } = t.context;

  await request(app.getHttpServer())
    .get('/private')
    .expect(HttpStatus.UNAUTHORIZED)
    .expect({
      statusCode: 401,
      message: 'You are not signed in.',
      error: 'Unauthorized',
    });

  t.assert(true);
});

test('should be able to visit private api if signed in', async t => {
  const { app, auth } = t.context;

  // @ts-expect-error mock
  auth.getUser.resolves({ id: '1' });

  const res = await request(app.getHttpServer())
    .get('/private')
    .set('Cookie', 'sid=1')
    .expect(HttpStatus.OK);

  t.is(res.body.user.id, '1');
});

test('should be able to parse session cookie', async t => {
  const { app, auth } = t.context;

  await request(app.getHttpServer())
    .get('/public')
    .set('cookie', 'sid=1')
    .expect(200);

  t.deepEqual(auth.getUser.firstCall.args, ['1', 0]);
});

test('should be able to parse bearer token', async t => {
  const { app, auth } = t.context;

  await request(app.getHttpServer())
    .get('/public')
    .auth('1', { type: 'bearer' })
    .expect(200);

  t.deepEqual(auth.getUser.firstCall.args, ['1', 0]);
});
