/// <reference types="../global.d.ts" />
import { equal } from 'node:assert';

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import test from 'ava';

import { ConfigModule } from '../config';
import { SessionModule, SessionService } from '../session';

let session: SessionService;
let module: TestingModule;

// cleanup database before each test
test.beforeEach(async () => {
  const client = new PrismaClient();
  await client.$connect();
  await client.user.deleteMany({});
});

test.beforeEach(async () => {
  module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot(), SessionModule],
  }).compile();
  session = module.get(SessionService);
});

test.afterEach(async () => {
  await module.close();
});

test('should be able to set session', async t => {
  await session.set('test', 'value');
  equal(await session.get('test'), 'value');
  t.pass();
});

test('should be expired by ttl', async t => {
  await session.set('test', 'value', 100);
  equal(await session.get('test'), 'value');
  await new Promise(resolve => setTimeout(resolve, 500));
  equal(await session.get('test'), undefined);
  t.pass();
});
