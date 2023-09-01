/// <reference types="../global.d.ts" />
import { equal } from 'node:assert';
import { afterEach, beforeEach, test } from 'node:test';

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { ConfigModule } from '../config';
import { Session, SessionModule } from '../session';

let session: Session;
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
  session = module.get(Session);
});

afterEach(async () => {
  await module.close();
});

test('should be able to set session', async () => {
  await session.set('test', 'value');
  equal(await session.get('test'), 'value');
});

test('should be expired by ttl', async () => {
  await session.set('test', 'value', 2);
  equal(await session.get('test'), 'value');
  await new Promise(resolve => setTimeout(resolve, 3000));
  equal(await session.get('test'), undefined);
});
