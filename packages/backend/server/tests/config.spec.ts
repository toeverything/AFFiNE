import { TestingModule } from '@nestjs/testing';
import test from 'ava';

import { Config, ConfigModule } from '../src/fundamentals/config';
import { createTestingModule } from './utils';

let config: Config;
let module: TestingModule;
test.beforeEach(async () => {
  module = await createTestingModule({}, false);
  config = module.get(Config);
});

test.afterEach.always(async () => {
  await module.close();
});

test('should be able to get config', t => {
  t.true(typeof config.server.host === 'string');
  t.is(config.projectRoot, process.cwd());
  t.is(config.NODE_ENV, 'test');
});

test('should be able to override config', async t => {
  const module = await createTestingModule({
    imports: [
      ConfigModule.forRoot({
        server: {
          host: 'testing',
        },
      }),
    ],
  });
  const config = module.get(Config);

  t.is(config.server.host, 'testing');

  await module.close();
});
