import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import test from 'ava';
import { get, has } from 'lodash-es';

import { createModule } from '../../../__tests__/create-module';
import {
  applyTestConfigOverrides,
  createTestRuntimeConfig,
} from '../../../__tests__/utils/runtime-config';
import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import { ServerConfigHandle } from '../../../native';
import { InvalidAppConfig } from '../../error';
import { CryptoHelper } from '../../helpers';
import { CacheRedis, SessionRedis, SocketIoRedis } from '../../redis/instances';
import { Config } from '../config';
import { ConfigFactory, ConfigModule } from '../index';
import { getDefaultConfig, override } from '../register';

const module = await createModule();
test.after.always(async () => {
  await module.close();
});

test('test runtime config applies explicit overrides after fixture values', async t => {
  const fixture = await createTestRuntimeConfig(
    'postgresql://test:test@localhost/test',
    getDefaultConfig().indexer
  );
  try {
    applyTestConfigOverrides(fixture.configPath, {
      copilot: { enabled: false },
      storages: {
        blob: {
          storage: {
            provider: 'fs',
            bucket: 'blobs',
            config: { path: fixture.storagePath },
          },
        },
      },
    });
    const config = JSON.parse(readFileSync(fixture.configPath, 'utf-8'));
    t.false(config.copilot.enabled);
    t.is(config.storages['blob.storage'].provider, 'fs');
    t.is(config.storages['avatar.storage'].provider, 'assetpack');
  } finally {
    await fixture.cleanup();
  }
});

test('should create config', async t => {
  const config = module.get(Config);
  const crypto = module.get(CryptoHelper);
  const runtime = module.get(BackendRuntimeProvider);

  crypto.onConfigInit();
  t.deepEqual(
    crypto.keyPair.sha256.privateKey,
    crypto.sha256(runtime.nodeCryptoPrivateKey())
  );

  t.is(typeof config.auth.passwordRequirements.max, 'number');
  t.deepEqual((await runtime.getByokPolicy()).allowedProviders, [
    'anthropic',
    'fal',
    'gemini',
    'openai',
  ]);
});

test('should read static config from the shared handle', t => {
  const directory = mkdtempSync(join(tmpdir(), 'affine-config-handle-'));
  try {
    const configPath = join(directory, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        deployment: { type: 'selfhosted' },
        server: { name: 'shared-config' },
        copilot: { enabled: false },
        oauth: {
          providers: {
            github: {
              clientId: 'native-client',
              clientSecret: 'native-secret',
            },
          },
        },
        redis: {
          host: '127.0.0.1',
          db: 4,
          ioredis: { enableAutoPipelining: true },
        },
      })
    );
    const handle = new ServerConfigHandle(configPath);
    const factory = new ConfigFactory(handle, {
      redis: { host: 'ignored.example', db: 1 },
    });
    const config = factory.config;

    t.is(handle.deploymentType, 'selfhosted');
    t.true(handle.hasBaselineConfigKey('oauth.providers.github'));
    t.false(handle.hasBaselineConfigKey('oauth.providers.oidc'));
    t.true(
      handle.nativeSecretAppConfigKeys().includes('oauth.providers.github')
    );
    t.is(JSON.parse(handle.nodeOwnedJson()).oauth, undefined);
    for (const key of handle.nativeAppConfigKeys()) {
      t.false(has(config, key), key);
    }
    factory.override({
      oauth: {
        providers: {
          github: {
            clientId: 'override-client',
            clientSecret: 'override-secret',
          },
        },
      },
    });
    t.is(get(config, 'oauth.providers.github'), undefined);
    const changes = factory.replaceDbOverrides({
      oauth: {
        providers: {
          github: {
            clientId: 'database-client',
            clientSecret: 'database-secret',
          },
        },
      },
    });
    t.is(get(config, 'oauth.providers.github'), undefined);
    t.is(get(changes, 'oauth.providers.github'), undefined);
    t.is(
      get(
        factory.redactNativeValues({
          oauth: {
            providers: {
              github: {
                clientId: 'event-client',
                clientSecret: 'event-secret',
              },
            },
          },
        }),
        'oauth.providers.github'
      ),
      undefined
    );
    t.is(config.server.name, 'shared-config');
    t.false(has(config, 'redis.ioredis'));
    t.true(JSON.parse(handle.redisNodeOptionsJson()).enableAutoPipelining);
    t.deepEqual(JSON.parse(handle.publicNativeBaselineJson()), {
      copilot: { enabled: false },
      redis: { host: '127.0.0.1', db: 4 },
    });
    const cache = new CacheRedis(handle);
    const session = new SessionRedis(handle);
    const socket = new SocketIoRedis(handle);
    try {
      const redisUrl = new URL(handle.redisUrl()!);
      t.is(cache.options.host, redisUrl.hostname);
      t.true(cache.options.enableAutoPipelining);
      const baseDb = Number(redisUrl.pathname.slice(1));
      t.is(cache.options.db, baseDb);
      t.is(session.options.db, baseDb + 2);
      t.is(socket.options.db, baseDb + 3);
    } finally {
      cache.disconnect();
      session.disconnect();
      socket.disconnect();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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

  const [nativeError] = config.validate([
    {
      module: 'copilot',
      key: 'byok.allowedProviders',
      value: ['openai', 'openai'],
    },
  ])!;
  t.true(nativeError instanceof InvalidAppConfig);
  t.regex(nativeError.message, /supported and unique/);
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
              secretAccessKey: '1',
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
        secretAccessKey: '1',
      },
    },
  });
});

test('should clone from original config without modifications', t => {
  const config = module.get(Config);
  const configFactory = module.get(ConfigFactory);

  config.auth.trustedCloudflareHeaders = !config.auth.trustedCloudflareHeaders;

  const newConfig = configFactory.clone();

  t.not(
    newConfig.auth.trustedCloudflareHeaders,
    config.auth.trustedCloudflareHeaders
  );
});

test('should override with undefined fields', async t => {
  await using module = await createModule({
    imports: [ConfigModule],
  });

  const config = module.get(Config);
  const configFactory = module.get(ConfigFactory);

  configFactory.override({
    copilot: {
      exa: {
        key: '',
        // @ts-expect-error undefined field
        unknown: '123',
      },
    },
  });

  // @ts-expect-error undefined field
  t.is(config.copilot.exa.unknown, '123');
});
