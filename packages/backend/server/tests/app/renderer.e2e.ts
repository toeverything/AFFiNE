import type { INestApplication } from '@nestjs/common';
import type { TestFn } from 'ava';
import ava from 'ava';
import request from 'supertest';

import { buildAppModule } from '../../src/app.module';
import { createTestingApp } from '../utils';

const test = ava as TestFn<{
  app: INestApplication;
}>;

test.before('start app', async t => {
  // @ts-expect-error override
  AFFiNE.flavor = {
    type: 'renderer',
    allinone: false,
    graphql: false,
    sync: false,
    renderer: true,
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
  const res = await request(t.context.app.getHttpServer())
    .get('/info')
    .expect(200);

  t.is(res.body.flavor, 'renderer');
});
