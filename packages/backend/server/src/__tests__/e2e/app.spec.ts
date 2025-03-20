import { getCurrentUserQuery } from '@affine/graphql';

import { app, e2e } from './test';

e2e('should create test app correctly', async t => {
  t.truthy(app);
});

e2e('should handle http request', async t => {
  const res = await app.GET('/info');
  t.is(res.status, 200);
  t.is(res.body.compatibility, AFFiNE.version);
});

e2e('should handle gql request', async t => {
  const user = await app.gql({ query: getCurrentUserQuery });
  t.is(user.currentUser, null);
});
