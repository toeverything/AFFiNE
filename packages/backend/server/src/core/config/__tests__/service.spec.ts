import { faker } from '@faker-js/faker';
import test from 'ava';
import Sinon from 'sinon';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import { InvalidAppConfigInput } from '../../../base';
import { Models } from '../../../models';
import { ServerService } from '../service';

const module = await createModule({
  providers: [ServerService],
});
const service = module.get(ServerService);
const user = await module.create(Mockers.User);
const models = module.get(Models);

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

  await models.appConfig.save(user.id, [
    {
      key: 'server.externalUrl',
      value: newValue,
    },
  ]);

  await service.revalidateConfig();

  t.not(service.getConfig().server.externalUrl, outdatedValue);
  t.is(service.getConfig().server.externalUrl, newValue);
});

test('should emit config changed event', async t => {
  const newUrl = faker.internet.url();

  await service.updateConfig(user.id, [
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
      allowSignup: false,
    },
  };

  t.true(
    module.event.emit.calledOnceWith('config.changed', {
      updates,
    })
  );
  t.true(
    module.event.broadcast.calledOnceWith('config.changed.broadcast', {
      updates,
    })
  );
});
