import type { INestApplication } from '@nestjs/common';
import type { TestFn } from 'ava';
import ava from 'ava';
import request from 'supertest';

import { buildAppModule } from '../../src/app.module';
import { createTestingApp } from '../utils';

const gql = '/graphql';

const test = ava as TestFn<{
  app: INestApplication;
}>;

test.before('start app', async t => {
  // @ts-expect-error override
  AFFiNE.flavor = {
    type: 'graphql',
    allinone: false,
    graphql: true,
    sync: false,
    renderer: false,
  } satisfies typeof AFFiNE.flavor;
  const { app } = await createTestingApp({
    imports: [buildAppModule()],
  });

  t.context.app = app;
});

test.after.always(async t => {
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

test('should return 404 for unknown path', async t => {
  await request(t.context.app.getHttpServer()).get('/unknown').expect(404);

  t.pass();
});

test('should be able to call apis', async t => {
  const res = await request(t.context.app.getHttpServer())
    .get('/info')
    .expect(200);

  t.is(res.body.flavor, 'graphql');
});
