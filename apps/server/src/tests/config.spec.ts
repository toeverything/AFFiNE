import { equal, ok } from 'node:assert';
import { afterEach, beforeEach, test } from 'node:test';

import { Test } from '@nestjs/testing';
import { register } from 'prom-client';

import { Config, ConfigModule } from '../config';

let config: Config;
beforeEach(async () => {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot()],
  }).compile();
  config = module.get(Config);
});

afterEach(async () => {
  register.clear();
});

test('should be able to get config', () => {
  ok(typeof config.host === 'string');
  equal(config.env, 'test');
});

test('should be able to override config', async () => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        host: 'testing',
      }),
    ],
  }).compile();
  const config = module.get(Config);

  ok(config.host, 'testing');
});
