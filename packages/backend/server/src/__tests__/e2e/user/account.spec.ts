import {
  deleteAccountMutation,
  disableUserMutation,
  getCurrentUserQuery,
  getWorkspaceQuery,
} from '@affine/graphql';
import { PrismaClient, WorkspaceMemberStatus } from '@prisma/client';
import Sinon from 'sinon';

import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import { WorkspaceRole } from '../../../models';
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
  const delivery = await app.get(PrismaClient).mailDelivery.findFirstOrThrow({
    where: { mailName: 'SignUp', recipientEmail: user.email },
  });
  t.is(delivery.recipientEmail, user.email);
});

e2e('should ban account', async t => {
  const interrupted = await app.create(Mockers.User);
  await app.login(admin);
  const runtime = app.get(BackendRuntimeProvider);
  const originalExecute = runtime.executeAuthSessionCommandV1.bind(runtime);
  const execute = Sinon.stub(runtime, 'executeAuthSessionCommandV1').callsFake(
    async input => {
      if (input.action === 'set_user_disabled') {
        throw new Error('injected disable failure');
      }
      return await originalExecute(input);
    }
  );
  try {
    await t.throwsAsync(
      app.gql({
        query: disableUserMutation,
        variables: { id: interrupted.id },
      })
    );
  } finally {
    execute.restore();
  }
  const preserved = await app.get(PrismaClient).user.findUniqueOrThrow({
    where: { email: interrupted.email },
  });
  t.true(preserved.disabled);

  const user = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, { owner: user });
  const doc = await app.create(Mockers.DocSnapshot, {
    user,
    workspaceId: workspace.id,
  });
  await app.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId: doc.id,
    public: true,
  });
  const db = app.get(PrismaClient);
  await db.$executeRaw`
    INSERT INTO doc_blob_refs
      (workspace_id, doc_id, blob_key, block_id, flavour, snapshot_updated_at, parser_version)
    VALUES (${workspace.id}, ${doc.id}, 'ban-blob', 'block', 'affine:attachment', NOW(), 1)
  `;
  await db.$executeRaw`
    INSERT INTO doc_blob_ref_projections (workspace_id, doc_id, parser_version, status)
    VALUES (${workspace.id}, ${doc.id}, 1, 'pending')
  `;
  await db.$executeRaw`
    INSERT INTO storage_reconciliation_runs (id, kind, mode, status, workspace_id)
    VALUES (${user.id}::uuid, 'blob_cleanup_plan', 'plan', 'finished', ${workspace.id})
  `;
  await db.$executeRaw`
    INSERT INTO blob_cleanup_candidates
      (workspace_id, blob_key, reason, status, object_size, run_id)
    VALUES (${workspace.id}, 'ban-blob', 'unreferenced', 'planned', 0, ${user.id}::uuid)
  `;

  const { banUser } = await app.gql({
    query: disableUserMutation,
    variables: {
      id: user.id,
    },
  });

  t.is(banUser.disabled, true);
  const disabled = await db.user.findUniqueOrThrow({
    where: { email: user.email },
  });
  t.not(disabled.id, user.id);
  t.true(disabled.disabled);
  t.is(await db.workspace.count({ where: { id: workspace.id } }), 0);
  t.is(
    await db.docAccessPolicy.count({ where: { workspaceId: workspace.id } }),
    0
  );
  for (const table of [
    'snapshots',
    'updates',
    'snapshot_histories',
    'doc_blob_refs',
    'doc_blob_ref_projections',
    'blob_cleanup_candidates',
    'storage_reconciliation_runs',
  ]) {
    const [result] = await db.$queryRawUnsafe<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE workspace_id = $1`,
      workspace.id
    );
    t.is(result.count, 0, table);
  }
  const response = await app
    .GET(`/workspace/${workspace.id}/${doc.id}`)
    .set('Accept', 'text/markdown');
  t.is(response.status, 404);
});

e2e('should ban account with pending workspace invitation', async t => {
  const owner = await app.create(Mockers.User);
  const user = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, { owner });

  await app.models.workspaceInvitation.set(
    workspace.id,
    user.id,
    WorkspaceRole.Collaborator,
    WorkspaceMemberStatus.Pending,
    { inviterId: owner.id }
  );

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
