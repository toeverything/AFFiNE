import ava from 'ava';

import { ChatQuerySchema } from '../../plugins/copilot/types';

const test = ava;

test('target override is all-or-nothing and preserves opaque model ids', t => {
  const parsed = ChatQuerySchema.parse({
    profileId: 'profile-1',
    modelId: 'vendor/model:B',
  });
  t.is(parsed.profileId, 'profile-1');
  t.is(parsed.modelId, 'vendor/model:B');
  t.throws(() => ChatQuerySchema.parse({ profileId: 'profile-1' }));
  t.throws(() => ChatQuerySchema.parse({ modelId: 'vendor/model:B' }));
  t.is(
    ChatQuerySchema.parse({ routeTargetId: 'terra' }).routeTargetId,
    'terra'
  );
});

test('caller supplied route policy facts are rejected', t => {
  for (const field of ['requirements', 'deployment', 'profiles', 'presets']) {
    t.throws(() => ChatQuerySchema.parse({ [field]: 'caller-value' }));
  }
});
