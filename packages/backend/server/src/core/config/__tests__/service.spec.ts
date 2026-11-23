import { faker } from '@faker-js/faker';
import { PrismaClient } from '@prisma/client';
import ava from 'ava';
import { get, has } from 'lodash-es';
import Sinon from 'sinon';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import { InvalidAppConfigInput } from '../../../base';
import { getDefaultConfig } from '../../../base/config/register';
import { Models } from '../../../models';
import { SearchProviderType } from '../../../plugins/indexer/config';
import { ServerService } from '../service';

const test = ava.serial;

const module = await createModule({
  providers: [ServerService],
});
const service = module.get(ServerService);
const user = await module.create(Mockers.User);
const models = module.get(Models);
const db = module.get(PrismaClient);

test.afterEach(async () => {
  Sinon.reset();
});

test.after.always(async () => {
  await module.close();
});

test('should update config', async t => {
  const oldValue = service.getConfig().server.externalUrl;
  const newValue = faker.internet.url();
  await service.updateConfig(user.id, [
    {
      module: 'server',
      key: 'externalUrl',
      value: newValue,
    },
  ]);

  t.not(service.getConfig().server.externalUrl, oldValue);
  t.is(service.getConfig().server.externalUrl, newValue);

  const secret = `test-admin-secret-${faker.string.uuid()}`;
  try {
    const response = await service.updateConfig(user.id, [
      { module: 'mailer', key: 'SMTP.password', value: secret },
    ]);
    t.is(get(service.getConfig(), 'mailer.SMTP.password'), secret);
    t.is(get(service.getAdminConfig(), 'mailer.SMTP.password'), undefined);
    t.is(get(response, 'mailer.SMTP.password'), undefined);
    t.is(
      get(
        await service.getAdminConfigMetadata(),
        'mailer.SMTP.password.source'
      ),
      'database'
    );
    t.true(
      get(
        await service.getAdminConfigMetadata(),
        'mailer.SMTP.password.configured'
      )
    );
    t.is(
      service.getAdminConfigValue('mailer', 'SMTP.password', secret),
      undefined
    );
  } finally {
    await db.appConfig.deleteMany({ where: { id: 'mailer.SMTP.password' } });
    await service.revalidateConfig();
  }
});

test('should clear a database override and restore the static value', async t => {
  const previous = await models.appConfig.get('auth.allowSignup');
  const value = faker.internet.url();
  await service.updateConfig(user.id, [
    { module: 'auth', key: 'allowSignup', clear: true },
  ]);
  const nativeBaseline = (await service.getEffectiveAdminConfig()).auth
    ?.allowSignup;
  try {
    await service.updateConfig(user.id, [
      { module: 'server', key: 'externalUrl', value },
      { module: 'auth', key: 'allowSignup', value: !nativeBaseline },
    ]);
    const effective = await service.updateConfig(user.id, [
      { module: 'server', key: 'externalUrl', clear: true },
      { module: 'auth', key: 'allowSignup', clear: true },
    ]);

    t.is(await models.appConfig.get('server.externalUrl'), null);
    t.is(
      service.getConfig().server.externalUrl,
      getDefaultConfig().server.externalUrl
    );
    t.is(effective.server?.externalUrl, getDefaultConfig().server.externalUrl);
    t.is(effective.auth?.allowSignup, nativeBaseline);
    t.false(has(service.getConfig(), 'auth.allowSignup'));
  } finally {
    if (previous) {
      await service.updateConfig(user.id, [
        { module: 'auth', key: 'allowSignup', value: previous.value },
      ]);
    }
  }
});

test('native secrets stay out of global and Admin config', async t => {
  t.false(has(service.getConfig(), 'db.datasourceUrl'));
  t.false(has(service.getAdminConfig(), 'db.datasourceUrl'));
  const secret = `native-secret-${faker.string.uuid()}`;
  try {
    const response = await service.updateConfig(user.id, [
      {
        module: 'oauth',
        key: 'providers.github',
        value: { clientId: 'test-client', clientSecret: secret },
      },
    ]);
    const event = module.event.last('config.changed').payload;
    t.true(has(event.updates, 'oauth.providers.github'));
    t.false(JSON.stringify(event).includes(secret));
    t.is(get(service.getConfig(), 'oauth.providers.github'), undefined);
    t.is(get(response, 'oauth.providers.github'), undefined);
    t.true(
      get(
        await service.getAdminConfigMetadata(),
        'oauth.providers.github.configured'
      )
    );
  } finally {
    await service.updateConfig(user.id, [
      { module: 'oauth', key: 'providers.github', clear: true },
    ]);
  }
});

test('should enable the selected indexer provider', async t => {
  await service.updateConfig(user.id, [
    {
      module: 'indexer',
      key: 'provider.type',
      value: SearchProviderType.Embedded,
    },
  ]);

  const effective = await service.getEffectiveAdminConfig();
  t.true(effective.indexer?.enabled);
  t.is(effective.indexer?.provider?.type, SearchProviderType.Embedded);
  t.false(has(service.getConfig(), 'indexer.enabled'));
});

test('should validate config before update', async t => {
  await t.throwsAsync(
    service.updateConfig(user.id, [
      {
        module: 'server',
        key: 'externalUrl',
        value: 'invalid-url@some-domain.com',
      },
    ]),
    {
      instanceOf: InvalidAppConfigInput,
    }
  );

  t.not(service.getConfig().server.externalUrl, 'invalid-url');

  await t.throwsAsync(
    service.updateConfig(user.id, [
      {
        module: 'auth',
        key: 'unknown-key',
        value: 'invalid-value',
      },
    ]),
    {
      instanceOf: InvalidAppConfigInput,
    }
  );

  t.is(
    // @ts-expect-error testing
    service.getConfig().auth['unknown-key'],
    undefined
  );

  await t.throwsAsync(
    service.updateConfig(user.id, [
      {
        module: 'auth',
        key: 'token.signingKeys',
        value: [{ secret: 'must-not-enter-app-config' }],
      },
    ]),
    { instanceOf: InvalidAppConfigInput }
  );

  for (const [module, key, value] of [
    ['db', 'datasourceUrl', 'postgresql://localhost:5432/other'],
    ['redis', 'host', 'redis.example'],
  ]) {
    t.truthy(
      service
        .validateConfig([{ module, key, value }])
        ?.find(error => error.data.module === module && error.data.key === key)
    );
    await t.throwsAsync(
      service.updateConfig(user.id, [{ module, key, value }]),
      {
        instanceOf: InvalidAppConfigInput,
      }
    );
    t.is(await models.appConfig.get(`${module}.${key}`), null);
    t.false(
      get(await service.getAdminConfigMetadata(), `${module}.${key}.settable`)
    );
  }
  const previousRedisHost = process.env.REDIS_SERVER_HOST;
  process.env.REDIS_SERVER_HOST = 'redis.example';
  try {
    t.is(
      get(await service.getAdminConfigMetadata(), 'redis.host.source'),
      'environment'
    );
  } finally {
    if (previousRedisHost === undefined) {
      delete process.env.REDIS_SERVER_HOST;
    } else {
      process.env.REDIS_SERVER_HOST = previousRedisHost;
    }
  }
});

test('should emit config.init event', async t => {
  await service.onApplicationBootstrap();
  const event = module.event.last('config.init');
  t.is(event.name, 'config.init');
  t.deepEqual(event.payload, {
    config: service.getConfig(),
  });
});

test('should revalidate config', async t => {
  const outdatedValue = service.getConfig().server.externalUrl;
  const newValue = faker.internet.url();
  const writeRemoteOverride = async (value: string) => {
    await db.appConfig.upsert({
      where: { id: 'server.externalUrl' },
      create: { id: 'server.externalUrl', value, lastUpdatedBy: user.id },
      update: { value, lastUpdatedBy: user.id },
    });
  };

  await writeRemoteOverride(newValue);

  await service.revalidateConfig();

  t.not(service.getConfig().server.externalUrl, outdatedValue);
  t.is(service.getConfig().server.externalUrl, newValue);

  const broadcastValue = faker.internet.url();
  await writeRemoteOverride(broadcastValue);
  await service.onConfigChangedBroadcast({ keys: ['server.externalUrl'] });
  t.is(service.getConfig().server.externalUrl, broadcastValue);

  // TODO(0.27.5): Remove this 0.27.4 broadcast case with the compatibility handler.
  const legacyValue = faker.internet.url();
  await writeRemoteOverride(legacyValue);
  await service.onConfigChangedBroadcast({
    updates: { server: { externalUrl: 'stale broadcast value' } },
  });
  t.is(service.getConfig().server.externalUrl, legacyValue);

  await db.appConfig.delete({ where: { id: 'server.externalUrl' } });
  await service.onConfigChangedBroadcast({ keys: ['server.externalUrl'] });
  t.is(
    service.getConfig().server.externalUrl,
    getDefaultConfig().server.externalUrl
  );

  await writeRemoteOverride(newValue);
  await service.revalidateConfig();
  await db.appConfig.delete({ where: { id: 'server.externalUrl' } });
  await service.revalidateConfig();
  t.is(
    service.getConfig().server.externalUrl,
    getDefaultConfig().server.externalUrl
  );
  t.is(
    module.event.last('config.changed').payload.updates.server?.externalUrl,
    getDefaultConfig().server.externalUrl
  );

  const previousNative = await models.appConfig.get('auth.allowSignup');
  try {
    await db.appConfig.upsert({
      where: { id: 'auth.allowSignup' },
      create: { id: 'auth.allowSignup', value: false, lastUpdatedBy: user.id },
      update: { value: false, lastUpdatedBy: user.id },
    });
    await service.revalidateConfig();
    await db.appConfig.delete({ where: { id: 'auth.allowSignup' } });
    await service.revalidateConfig();
    const updates = module.event.last('config.changed').payload.updates;
    t.true(has(updates, 'auth.allowSignup'));
    t.is(updates.auth?.allowSignup, undefined);
  } finally {
    if (previousNative) {
      await service.updateConfig(user.id, [
        {
          module: 'auth',
          key: 'allowSignup',
          value: previousNative.value,
        },
      ]);
    }
    await service.revalidateConfig();
  }
});

test('should roll back invalid multi-key app config updates', async t => {
  await db.$executeRawUnsafe(`
    CREATE FUNCTION test_app_config_rollback_failure() RETURNS trigger AS $$
    BEGIN
      IF NEW.id LIKE 'testConfigRollback.%.second' OR NEW.id = 'auth.allowSignup' THEN
        RAISE EXCEPTION 'injected config write failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await db.$executeRawUnsafe(`
    CREATE TRIGGER test_app_config_rollback_failure
    BEFORE INSERT OR UPDATE ON app_configs
    FOR EACH ROW EXECUTE FUNCTION test_app_config_rollback_failure();
  `);

  try {
    const beforeRow = await models.appConfig.get('server.externalUrl');
    const beforeValue = service.getConfig().server.externalUrl;
    await t.throwsAsync(
      service.updateConfig(user.id, [
        {
          module: 'server',
          key: 'externalUrl',
          value: faker.internet.url(),
        },
        { module: 'auth', key: 'allowSignup', value: false },
      ]),
      { message: /injected config write failure/ }
    );
    t.deepEqual(await models.appConfig.get('server.externalUrl'), beforeRow);
    t.is(service.getConfig().server.externalUrl, beforeValue);
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER test_app_config_rollback_failure ON app_configs'
    );
    await db.$executeRawUnsafe(
      'DROP FUNCTION test_app_config_rollback_failure()'
    );
  }
});

test('should emit config changed event', async t => {
  const newUrl = faker.internet.url();

  const response = await service.updateConfig(user.id, [
    {
      module: 'server',
      key: 'externalUrl',
      value: newUrl,
    },
    {
      module: 'auth',
      key: 'allowSignup',
      value: false,
    },
  ]);

  const updates = {
    server: {
      externalUrl: newUrl,
    },
    auth: {
      allowSignup: undefined,
    },
  };

  t.is(response.auth?.allowSignup, false);

  t.true(
    module.event.emit.calledOnceWith('config.changed', {
      updates,
    })
  );
  t.true(
    module.event.broadcast.calledOnceWith('config.changed.broadcast', {
      keys: ['server.externalUrl', 'auth.allowSignup'],
    })
  );
});
