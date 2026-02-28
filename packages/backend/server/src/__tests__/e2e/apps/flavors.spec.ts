import { getCurrentUserQuery } from '@affine/graphql';

import { createApp } from '../create-app';
import { e2e } from '../test';

e2e('should init doc service', async t => {
  // @ts-expect-error override
  globalThis.env.FLAVOR = 'doc';
  await using app = await createApp();

  const res = await app.GET('/info').expect(200);
  t.is(res.body.flavor, 'doc');

  await t.throwsAsync(app.gql({ query: getCurrentUserQuery }));
});

e2e('should init graphql service', async t => {
  // @ts-expect-error override
  globalThis.env.FLAVOR = 'graphql';
  await using app = await createApp();

  const res = await app.GET('/info').expect(200);

  t.is(res.body.flavor, 'graphql');

  const user = await app.gql({ query: getCurrentUserQuery });
  t.is(user.currentUser, null);
});

e2e('should init sync service', async t => {
  // @ts-expect-error override
  globalThis.env.FLAVOR = 'sync';
  await using app = await createApp();

  const res = await app.GET('/info').expect(200);
  t.is(res.body.flavor, 'sync');
});

e2e('should init renderer service', async t => {
  // @ts-expect-error override
  globalThis.env.FLAVOR = 'renderer';
  await using app = await createApp();

  const res = await app.GET('/info').expect(200);
  t.is(res.body.flavor, 'renderer');
});
