import { HttpStatus, INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';
import request from 'supertest';

import { AuthModule, CurrentUser } from '../../src/core/auth';
import { AuthService } from '../../src/core/auth/service';
import { FeatureModule } from '../../src/core/features';
import { UserModule, UserService } from '../../src/core/user';
import { MailService } from '../../src/fundamentals';
import { createTestingApp, getSession, sessionCookie } from '../utils';

const test = ava as TestFn<{
  auth: AuthService;
  user: UserService;
  u1: CurrentUser;
  db: PrismaClient;
  mailer: Sinon.SinonStubbedInstance<MailService>;
  app: INestApplication;
}>;

test.beforeEach(async t => {
  const { app } = await createTestingApp({
    imports: [FeatureModule, UserModule, AuthModule],
    tapModule: m => {
      m.overrideProvider(MailService).useValue(
        Sinon.createStubInstance(MailService)
      );
    },
  });

  t.context.auth = app.get(AuthService);
  t.context.user = app.get(UserService);
  t.context.db = app.get(PrismaClient);
  t.context.mailer = app.get(MailService);
  t.context.app = app;

  t.context.u1 = await t.context.auth.signUp('u1', 'u1@affine.pro', '1');
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('should be able to sign in with credential', async t => {
  const { app, u1 } = t.context;

  const res = await request(app.getHttpServer())
    .post('/api/auth/sign-in')
    .send({ email: u1.email, password: '1' })
    .expect(200);

  const session = await getSession(app, res);
  t.is(session.user!.id, u1.id);
});

test('should be able to sign in with email', async t => {
  const { app, u1, mailer } = t.context;

  // @ts-expect-error mock
  mailer.sendSignInMail.resolves({ rejected: [] });

  const res = await request(app.getHttpServer())
    .post('/api/auth/sign-in')
    .send({ email: u1.email })
    .expect(200);

  t.is(res.body.email, u1.email);
  t.true(mailer.sendSignInMail.calledOnce);

  const [signInLink] = mailer.sendSignInMail.firstCall.args;
  const url = new URL(signInLink);
  const email = url.searchParams.get('email');
  const token = url.searchParams.get('token');

  const signInRes = await request(app.getHttpServer())
    .post('/api/auth/magic-link')
    .send({ email, token })
    .expect(201);

  const session = await getSession(app, signInRes);
  t.is(session.user!.id, u1.id);
});

test('should be able to sign up with email', async t => {
  const { app, mailer } = t.context;

  // @ts-expect-error mock
  mailer.sendSignUpMail.resolves({ rejected: [] });

  const res = await request(app.getHttpServer())
    .post('/api/auth/sign-in')
    .send({ email: 'u2@affine.pro' })
    .expect(200);

  t.is(res.body.email, 'u2@affine.pro');
  t.true(mailer.sendSignUpMail.calledOnce);

  const [signUpLink] = mailer.sendSignUpMail.firstCall.args;
  const url = new URL(signUpLink);
  const email = url.searchParams.get('email');
  const token = url.searchParams.get('token');

  const signInRes = await request(app.getHttpServer())
    .post('/api/auth/magic-link')
    .send({ email, token })
    .expect(201);

  const session = await getSession(app, signInRes);
  t.is(session.user!.email, 'u2@affine.pro');
});

test('should not be able to sign in if email is invalid', async t => {
  const { app } = t.context;

  const res = await request(app.getHttpServer())
    .post('/api/auth/sign-in')
    .send({ email: '' })
    .expect(400);

  t.is(res.body.message, 'Invalid email address');
});

test('should not be able to sign in if forbidden', async t => {
  const { app, auth, u1, mailer } = t.context;

  const canSignInStub = Sinon.stub(auth, 'canSignIn').resolves(false);

  await request(app.getHttpServer())
    .post('/api/auth/sign-in')
    .send({ email: u1.email })
    .expect(HttpStatus.BAD_REQUEST);

  t.true(mailer.sendSignInMail.notCalled);

  canSignInStub.restore();
});

test('should be able to sign out', async t => {
  const { app, u1 } = t.context;

  const signInRes = await request(app.getHttpServer())
    .post('/api/auth/sign-in')
    .send({ email: u1.email, password: '1' })
    .expect(200);

  const cookie = sessionCookie(signInRes.headers);

  await request(app.getHttpServer())
    .get('/api/auth/sign-out')
    .set('cookie', cookie)
    .expect(200);

  const session = await getSession(app, signInRes);

  t.falsy(session.user);
});

test('should not be able to sign out if not signed in', async t => {
  const { app } = t.context;

  await request(app.getHttpServer())
    .get('/api/auth/sign-out')
    .expect(HttpStatus.UNAUTHORIZED);

  t.assert(true);
});
