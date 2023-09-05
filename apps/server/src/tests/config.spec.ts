import { ok } from 'node:assert';

import { Test } from '@nestjs/testing';
import test from 'ava';

import { Config, ConfigModule } from '../config';

let config: Config;
test.beforeEach(async () => {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot()],
  }).compile();
  config = module.get(Config);
});

test('should be able to get config', t => {
  t.true(typeof config.host === 'string');
  t.is(config.env, 'test');
});

test('should be able to override config', async t => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        host: 'testing',
      }),
    ],
  }).compile();
  const config = module.get(Config);

  ok(config.host, 'testing');
  t.pass();
});
