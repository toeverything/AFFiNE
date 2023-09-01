/// <reference types="../global.d.ts" />
import { equal } from 'node:assert';
import { afterEach, beforeEach, test } from 'node:test';

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { ConfigModule } from '../config';
import { SessionModule, SessionService } from '../session';

let session: SessionService;
let module: TestingModule;

// cleanup database before each test
beforeEach(async () => {
  const client = new PrismaClient();
  await client.$connect();
  await client.user.deleteMany({});
});

beforeEach(async () => {
  module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot(), SessionModule],
  }).compile();
  session = module.get(SessionService);
});

afterEach(async () => {
  await module.close();
});

test('should be able to set session', async () => {
  await session.set('test', 'value');
  equal(await session.get('test'), 'value');
});

test('should be expired by ttl', async () => {
  await session.set('test', 'value', 100);
  equal(await session.get('test'), 'value');
  await new Promise(resolve => setTimeout(resolve, 500));
  equal(await session.get('test'), undefined);
});
