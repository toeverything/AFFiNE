import test from 'ava';

import { createModule } from '../../../__tests__/create-module';
import { InvalidAppConfig } from '../../error';
import { ConfigFactory, ConfigModule } from '..';
import { Config } from '../config';
import { override } from '../register';

const module = await createModule();
test.after.always(async () => {
  await module.close();
});

test('should create config', t => {
  const config = module.get(Config);

  t.is(typeof config.auth.passwordRequirements.max, 'number');
  t.is(typeof config.job.queue, 'object');
});

test('should override config', async t => {
  await using module = await createModule({
    imports: [
      ConfigModule.override({
        auth: {
          passwordRequirements: {
            max: 100,
            min: 6,
          },
        },
        job: {
          queues: {
            notification: {
              concurrency: 1000,
            },
          },
        },
      }),
    ],
  });

  const config = module.get(Config);
  const configFactory = module.get(ConfigFactory);

  t.deepEqual(config.auth.passwordRequirements, {
    max: 100,
    min: 6,
  });

  configFactory.override({
    auth: {
      passwordRequirements: {
        max: 10,
        min: 1,
      },
    },
  });

  t.deepEqual(config.auth.passwordRequirements, {
    max: 10,
    min: 1,
  });
});

test('should validate config', t => {
  const config = module.get(ConfigFactory);

  t.is(
    config.validate([
      {
        module: 'auth',
        key: 'passwordRequirements',
        value: { max: 10, min: 6 },
      },
    ]),
    null
  );

  const [error] = config.validate([
    {
      module: 'auth',
      key: 'passwordRequirements',
      value: { max: 10, min: 10 },
    },
  ])!;

  t.true(error instanceof InvalidAppConfig);
  t.is(
    error.message,
    'Invalid app config for module `auth` with key `passwordRequirements`. Minimum length of password must be less than maximum length.'
  );
});

test('should override correctly', t => {
  const config = {
    auth: {
      // object config
      passwordRequirements: {
        max: 10,
        min: 6,
      },
      allowSignup: false,
      // keyed config
      // 'session.ttl', 'session.ttr'
      session: {
        ttl: 2000,
        ttr: 1000,
      },
    },
    storages: {
      avatar: {
        // keyed config
        // "avatar.publicPath: String"
        publicPath: '/',
        // object config
        // "avatar.storage => Object { }"
        storage: {
          provider: 'fs',
          config: {
            path: '/path/to/avatar',
          },
        },
      },
    },
  } as AppConfig;

  override(config, {
    auth: {
      passwordRequirements: {
        max: 20,
      },
      allowSignup: true,
      session: {
        ttl: 3000,
      },
    },
    storages: {
      avatar: {
        storage: {
          provider: 'aws-s3',
          config: {
            credentials: {
              accessKeyId: '1',
              accessKeySecret: '1',
            },
          },
        },
      },
    },
  });

  // simple value override
  t.deepEqual(config.auth.allowSignup, true);

  // right covered left
  t.deepEqual(config.auth.passwordRequirements, {
    max: 20,
  });

  // right merged to left
  t.deepEqual(config.auth.session, {
    ttl: 3000,
    ttr: 1000,
  });

  // right covered left
  t.deepEqual(config.storages.avatar.storage, {
    provider: 'aws-s3',
    config: {
      credentials: {
        accessKeyId: '1',
        accessKeySecret: '1',
      },
    },
  });
});

test('should clone from original config without modifications', t => {
  const config = module.get(Config);
  const configFactory = module.get(ConfigFactory);

  config.auth.allowSignup = !config.auth.allowSignup;

  const newConfig = configFactory.clone();

  t.not(newConfig.auth.allowSignup, config.auth.allowSignup);
});

test('should override with undefined fields', async t => {
  await using module = await createModule({
    imports: [ConfigModule],
  });

  const config = module.get(Config);
  const configFactory = module.get(ConfigFactory);

  configFactory.override({
    copilot: {
      providers: {
        // @ts-expect-error undefined field
        unknown: {
          apiKey: '123',
        },
      },
    },
  });

  // @ts-expect-error undefined field
  t.deepEqual(config.copilot.providers.unknown, {
    apiKey: '123',
  });
});
