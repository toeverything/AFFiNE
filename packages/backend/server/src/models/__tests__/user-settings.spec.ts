import test from 'ava';
import { ZodError } from 'zod';

import { createModule } from '../../__tests__/create-module';
import { Mockers } from '../../__tests__/mocks';
import { Models } from '..';

const module = await createModule();
const models = module.get(Models);

test.after.always(async () => {
  await module.close();
});

test('should get a user settings with default value', async t => {
  const user = await module.create(Mockers.User);

  const settings = await models.userSettings.get(user.id);

  t.snapshot(settings);
});

test('should update a user settings', async t => {
  const user = await module.create(Mockers.User);

  const settings = await models.userSettings.set(user.id, {
    receiveInvitationEmail: false,
  });

  t.snapshot(settings);

  const settings2 = await models.userSettings.get(user.id);

  t.deepEqual(settings2, settings);

  // update existing setting
  const setting3 = await models.userSettings.set(user.id, {
    receiveInvitationEmail: true,
  });

  t.snapshot(setting3);

  const setting4 = await models.userSettings.get(user.id);

  t.deepEqual(setting4, setting3);

  const setting5 = await models.userSettings.set(user.id, {
    receiveMentionEmail: false,
    receiveInvitationEmail: false,
  });

  t.snapshot(setting5);

  const setting6 = await models.userSettings.get(user.id);

  t.deepEqual(setting6, setting5);
});

test('should set receiveCommentEmail to false', async t => {
  const user = await module.create(Mockers.User);

  const settings = await models.userSettings.set(user.id, {
    receiveCommentEmail: false,
  });

  t.snapshot(settings);

  const settings2 = await models.userSettings.get(user.id);

  t.deepEqual(settings2, settings);
});

test('should throw error when update settings with invalid payload', async t => {
  const user = await module.create(Mockers.User);

  await t.throwsAsync(
    models.userSettings.set(user.id, {
      // @ts-expect-error invalid setting input types
      receiveInvitationEmail: 1,
    }),
    {
      instanceOf: ZodError,
      message: /Expected boolean, received number/,
    }
  );
});
