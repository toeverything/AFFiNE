/// <reference types="../src/global.d.ts" />

import { TestingModule } from '@nestjs/testing';
import ava, { type TestFn } from 'ava';

import { CacheModule } from '../src/fundamentals/cache';
import { SessionModule, SessionService } from '../src/fundamentals/session';
import { createTestingModule } from './utils';

const test = ava as TestFn<{
  session: SessionService;
  module: TestingModule;
}>;

test.beforeEach(async t => {
  const module = await createTestingModule({
    imports: [CacheModule, SessionModule],
  });
  const session = module.get(SessionService);
  t.context.module = module;
  t.context.session = session;
});

test.afterEach.always(async t => {
  await t.context.module.close();
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
