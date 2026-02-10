import { getUserQuery } from '@affine/graphql';
import Sinon from 'sinon';

import { ThrottlerStorage } from '../../../base/throttler';
import { app, e2e, Mockers } from '../test';

e2e('user(email) should return null without auth', async t => {
  const user = await app.create(Mockers.User);

  await app.logout();

  const res = await app.gql({
    query: getUserQuery,
    variables: { email: user.email },
  });

  t.is(res.user, null);
});

e2e('user(email) should return null outside workspace scope', async t => {
  await app.logout();
  const me = await app.signup();
  const other = await app.create(Mockers.User);

  const res = await app.gql({
    query: getUserQuery,
    variables: { email: other.email },
  });

  t.is(res.user, null);

  // sanity: querying self is always allowed
  const self = await app.gql({
    query: getUserQuery,
    variables: { email: me.email },
  });
  t.truthy(self.user);
  if (!self.user) return;
  t.is(self.user.__typename, 'UserType');
  if (self.user.__typename === 'UserType') {
    t.is(self.user.id, me.id);
  }
});

e2e('user(email) should return user within workspace scope', async t => {
  await app.logout();
  const me = await app.signup();
  const other = await app.create(Mockers.User);
  const ws = await app.create(Mockers.Workspace, { owner: me });

  await app.create(Mockers.WorkspaceUser, {
    workspaceId: ws.id,
    userId: other.id,
  });

  const res = await app.gql({
    query: getUserQuery,
    variables: { email: other.email },
  });

  t.truthy(res.user);
  if (!res.user) return;
  t.is(res.user.__typename, 'UserType');
  if (res.user.__typename === 'UserType') {
    t.is(res.user.id, other.id);
  }
});

e2e('user(email) should be rate limited', async t => {
  await app.logout();
  const me = await app.signup();

  const stub = Sinon.stub(app.get(ThrottlerStorage), 'increment').resolves({
    timeToExpire: 10,
    totalHits: 21,
    isBlocked: true,
    timeToBlockExpire: 10,
  });

  await t.throwsAsync(
    app.gql({
      query: getUserQuery,
      variables: { email: me.email },
    }),
    { message: /too many requests/i }
  );

  stub.restore();
});
