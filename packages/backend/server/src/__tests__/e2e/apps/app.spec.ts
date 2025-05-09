import { getCurrentUserQuery } from '@affine/graphql';

import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

e2e('should create test app correctly', async t => {
  t.truthy(app);
});

e2e('should mock mails work', async t => {
  t.is(app.mails.count('MemberInvitation'), 0);
});

e2e('should mock queue work', async t => {
  t.is(app.queue.count('notification.sendInvitation'), 0);
});

e2e('should handle http request', async t => {
  const res = await app.GET('/info');
  t.is(res.status, 200);
  t.is(res.body.compatibility, env.version);
});

e2e('should create workspace with owner', async t => {
  const user = await app.signup();
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: user.id },
  });
  t.truthy(workspace);
});

e2e('should get current user', async t => {
  const user = await app.signup();
  await app.switchUser(user);
  const res = await app.gql({ query: getCurrentUserQuery });
  t.truthy(res.currentUser);
  t.is(res.currentUser!.id, user.id);
});
