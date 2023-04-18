import { ok } from 'node:assert';
import { afterEach, beforeEach, test } from 'node:test';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../app';
import { getDefaultAFFiNEConfig } from '../config/default';

globalThis.AFFiNE = getDefaultAFFiNEConfig();
let app: INestApplication;

beforeEach(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  await app.init();
});

afterEach(async () => {
  await app.close();
});

test('should init app', () => {
  ok(typeof app === 'object');
});
