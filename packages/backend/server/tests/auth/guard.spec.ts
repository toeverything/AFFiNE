import { Controller, Get, HttpStatus, INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';
import request from 'supertest';

import { AuthModule, CurrentUser, Public, Session } from '../../src/core/auth';
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

  @Get('/session')
  session(@Session() session: Session) {
    return session;
  }
}

const test = ava as TestFn<{
  app: INestApplication;
}>;

let server!: any;
let auth!: AuthService;
let u1!: CurrentUser;

test.before(async t => {
  const { app } = await createTestingApp({
    imports: [AuthModule],
    controllers: [TestController],
  });

  auth = app.get(AuthService);
  u1 = await auth.signUp('u1@affine.pro', '1');

  const db = app.get(PrismaClient);
  await db.session.create({
    data: {
      id: '1',
    },
  });
  await auth.createUserSession(u1.id, '1');

  server = app.getHttpServer();
  t.context.app = app;
});

test.after.always(async t => {
  await t.context.app.close();
});

test('should be able to visit public api if not signed in', async t => {
  const res = await request(server).get('/public').expect(200);

  t.is(res.body.user, undefined);
});

test('should be able to visit public api if signed in', async t => {
  const res = await request(server)
    .get('/public')
    .set('Cookie', `${AuthService.sessionCookieName}=1`)
    .expect(HttpStatus.OK);

  t.is(res.body.user.id, u1.id);
});

test('should not be able to visit private api if not signed in', async t => {
  await request(server).get('/private').expect(HttpStatus.UNAUTHORIZED).expect({
    status: 401,
    code: 'Unauthorized',
    type: 'AUTHENTICATION_REQUIRED',
    name: 'AUTHENTICATION_REQUIRED',
    message: 'You must sign in first to access this resource.',
  });

  t.assert(true);
});

test('should be able to visit private api if signed in', async t => {
  const res = await request(server)
    .get('/private')
    .set('Cookie', `${AuthService.sessionCookieName}=1`)
    .expect(HttpStatus.OK);

  t.is(res.body.user.id, u1.id);
});

test('should be able to parse session cookie', async t => {
  const spy = Sinon.spy(auth, 'getUserSession');
  await request(server)
    .get('/public')
    .set('cookie', `${AuthService.sessionCookieName}=1`)
    .expect(200);

  t.deepEqual(spy.firstCall.args, ['1', undefined]);
  spy.restore();
});

test('should be able to parse bearer token', async t => {
  const spy = Sinon.spy(auth, 'getUserSession');

  await request(server)
    .get('/public')
    .auth('1', { type: 'bearer' })
    .expect(200);

  t.deepEqual(spy.firstCall.args, ['1', undefined]);
  spy.restore();
});

test('should be able to refresh session if needed', async t => {
  await t.context.app.get(PrismaClient).userSession.updateMany({
    where: {
      sessionId: '1',
    },
    data: {
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 /* expires in 1 hour */),
    },
  });

  const res = await request(server)
    .get('/session')
    .set('cookie', `${AuthService.sessionCookieName}=1`)
    .expect(200);

  const cookie = res
    .get('Set-Cookie')
    ?.find(c => c.startsWith(AuthService.sessionCookieName));

  t.truthy(cookie);
});
