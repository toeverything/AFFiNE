import type { INestApplication } from '@nestjs/common';
import ava, { type TestFn } from 'ava';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { createTestingApp } from './utils';

const gql = '/graphql';

const test = ava as TestFn<{
  app: INestApplication;
}>;

test.beforeEach(async t => {
  const { app } = await createTestingApp({
    imports: [AppModule],
  });

  t.context.app = app;
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('should init app', async t => {
  await request(t.context.app.getHttpServer())
    .post(gql)
    .send({
      query: `
          query {
            error
          }
        `,
    })
    .expect(400);

  const response = await request(t.context.app.getHttpServer())
    .post(gql)
    .send({
      query: `query {
        serverConfig {
          name
          version
          type
          features
        }
      }`,
    })
    .expect(200);

  const config = response.body.data.serverConfig;

  t.is(config.type, 'Affine');
  t.true(Array.isArray(config.features));
});
