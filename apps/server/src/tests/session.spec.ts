/// <reference types="../global.d.ts" />

import { Test, TestingModule } from '@nestjs/testing';
import ava, { TestFn } from 'ava';

import { ConfigModule } from '../config';
import { SessionModule, SessionService } from '../session';

const test = ava as TestFn<{
  session: SessionService;
  app: TestingModule;
}>;

test.beforeEach(async t => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        redis: {
          enabled: false,
        },
      }),
      SessionModule,
    ],
  }).compile();
  const session = module.get(SessionService);
  t.context.app = module;
  t.context.session = session;
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('should be able to set session', async t => {
  const { session } = t.context;
  await session.set('test', 'value');
  t.is(await session.get('test'), 'value');
});

test('should be expired by ttl', async t => {
  const { session } = t.context;
  await session.set('test', 'value', 100);
  t.is(await session.get('test'), 'value');
  await new Promise(resolve => setTimeout(resolve, 500));
  t.is(await session.get('test'), undefined);
});
