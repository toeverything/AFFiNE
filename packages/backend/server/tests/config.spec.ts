import { Test, TestingModule } from '@nestjs/testing';
import test from 'ava';

import { Config, ConfigModule } from '../src/config';

let config: Config;
let module: TestingModule;
test.beforeEach(async () => {
  module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot()],
  }).compile();
  config = module.get(Config);
});

test.afterEach.always(async () => {
  await module.close();
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

  t.is(config.host, 'testing');
});
