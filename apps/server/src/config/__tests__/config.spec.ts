import { Test } from '@nestjs/testing';
import { beforeEach, expect, test } from 'vitest';

import { Config, ConfigModule } from '..';
import { getDefaultAFFiNEConfig } from '../default';
globalThis.AFFiNE = getDefaultAFFiNEConfig();

let config: Config;
beforeEach(async () => {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot()],
  }).compile();
  config = module.get(Config);
});

test('should be able to get config', t => {
  expect(typeof config.host === 'string');
  expect(config.env).toEqual('test');
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

  expect(config.host).toEqual('testing');
});
