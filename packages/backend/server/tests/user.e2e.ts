import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import test from 'ava';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';
import request from 'supertest';

import { AppModule } from '../src/app';
import { currentUser, signUp } from './utils';

let app: INestApplication;

// cleanup database before each test
test.beforeEach(async () => {
  const client = new PrismaClient();
  await client.$connect();
  await client.user.deleteMany({});
  await client.$disconnect();
});

test.beforeEach(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  app.use(
    graphqlUploadExpress({
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
  await app.init();
});

test.afterEach.always(async () => {
  await app.close();
});

test('should register a user', async t => {
  const user = await signUp(app, 'u1', 'u1@affine.pro', '123456');
  t.is(typeof user.id, 'string', 'user.id is not a string');
  t.is(user.name, 'u1', 'user.name is not valid');
  t.is(user.email, 'u1@affine.pro', 'user.email is not valid');
});

test('should get current user', async t => {
  const user = await signUp(app, 'u1', 'u1@affine.pro', '123456');
  const currUser = await currentUser(app, user.token.token);
  t.is(currUser.id, user.id, 'user.id is not valid');
  t.is(currUser.name, user.name, 'user.name is not valid');
  t.is(currUser.email, user.email, 'user.email is not valid');
  t.true(currUser.hasPassword, 'currUser.hasPassword is not valid');
});

test('should be able to delete user', async t => {
  const user = await signUp(app, 'u1', 'u1@affine.pro', '123456');
  await request(app.getHttpServer())
    .post('/graphql')
    .auth(user.token.token, { type: 'bearer' })
    .send({
      query: `
          mutation {
            deleteAccount {
              success
            }
          }
        `,
    })
    .expect(200);
  t.is(await currentUser(app, user.token.token), null);
  t.pass();
});
