import {
  deleteAccountMutation,
  disableUserMutation,
  getCurrentUserQuery,
  getWorkspaceQuery,
} from '@affine/graphql';

import { app, e2e, Mockers } from '../test';

const admin = await app.create(Mockers.User, {
  feature: 'administrator',
});

e2e('should be able to delete account', async t => {
  const user = await app.signup();
  const user2 = await app.create(Mockers.User);
  const ws = await app.create(Mockers.Workspace, {
    owner: user,
  });

  await app.create(Mockers.WorkspaceUser, {
    workspaceId: ws.id,
    userId: user2.id,
  });

  await app.gql({
    query: deleteAccountMutation,
  });

  // assert session removed
  const { currentUser } = await app.gql({
    query: getCurrentUserQuery,
  });

  t.is(currentUser, null);

  // assert login failed
  const res = await app.login(user);
  t.is(res.status, 400);
  t.like(res.body, {
    message: `Wrong user email or password: ${user.email}`,
  });

  // assert workspace access deleted
  await app.login(user2);
  await t.throwsAsync(
    app.gql({
      query: getWorkspaceQuery,
      variables: {
        id: ws.id,
      },
    }),
    {
      message: `You do not have permission to access Space ${ws.id}.`,
    }
  );
});

e2e('should not delete account if is owner of team workspace', async t => {
  const user = await app.signup();
  const ws = await app.create(Mockers.Workspace, {
    owner: user,
  });

  await app.create(Mockers.TeamWorkspace, {
    id: ws.id,
  });

  await t.throwsAsync(
    app.gql({
      query: deleteAccountMutation,
    }),
    {
      message:
        'Cannot delete account. You are the owner of one or more team workspaces. Please transfer ownership or delete them first.',
    }
  );
});

e2e('should register deleted account again', async t => {
  const user = await app.signup();
  await app.gql({
    query: deleteAccountMutation,
  });

  const res = await app.POST('/api/auth/sign-in').send({
    email: user.email,
  });
  t.is(res.status, 200);
  t.like(await app.mails.waitFor('SignUp'), {
    to: user.email,
  });
});

e2e('should ban account', async t => {
  const user = await app.create(Mockers.User);

  await app.login(admin);

  const { banUser } = await app.gql({
    query: disableUserMutation,
    variables: {
      id: user.id,
    },
  });

  t.is(banUser.disabled, true);
});

e2e('should not login banned account', async t => {
  const user = await app.create(Mockers.User);

  await app.login(admin);

  await app.gql({
    query: disableUserMutation,
    variables: {
      id: user.id,
    },
  });
  await app.logout();

  const res = await app.login(user);
  t.is(res.status, 400);
  t.like(res.body, {
    message: `Wrong user email or password: ${user.email}`,
  });
});

e2e('should not signup banned account', async t => {
  const user = await app.create(Mockers.User);

  await app.login(admin);

  await app.gql({
    query: disableUserMutation,
    variables: {
      id: user.id,
    },
  });

  const res = await app.POST('/api/auth/sign-in').send({
    email: user.email,
  });

  t.is(res.status, 400);
  t.like(res.body, {
    message: `Wrong user email or password: ${user.email}`,
  });
});
