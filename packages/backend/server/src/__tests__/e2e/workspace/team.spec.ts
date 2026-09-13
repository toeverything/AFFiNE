import {
  inviteByEmailsMutation,
  publishPageMutation,
  revokeMemberPermissionMutation,
  revokePublicPageMutation,
  WorkspaceMemberStatus,
} from '@affine/graphql';

import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import { EntitlementService } from '../../../core/entitlement';
import { QuotaService } from '../../../core/quota/service';
import { WorkspaceRole } from '../../../models';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
} from '../../../plugins/payment/types';
import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

const teamE2E = e2e.serial;

const createTeamWorkspace = async (memberLimit = 3) => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: {
      id: owner.id,
    },
  });
  await app.create(Mockers.TeamWorkspace, {
    id: workspace.id,
    quantity: memberLimit,
  });

  const writer = await app.create(Mockers.User);
  await app.create(Mockers.WorkspaceUser, {
    userId: writer.id,
    workspaceId: workspace.id,
  });

  const admin = await app.create(Mockers.User);
  await app.create(Mockers.WorkspaceUser, {
    userId: admin.id,
    workspaceId: workspace.id,
    type: WorkspaceRole.Admin,
  });

  const external = await app.create(Mockers.User);

  return {
    workspace,
    owner,
    admin,
    writer,
    external,
  };
};

const publishDoc = async (workspaceId: string, docId: string) => {
  const { publishDoc } = await app.gql({
    query: publishPageMutation,
    variables: {
      workspaceId,
      pageId: docId,
    },
  });

  return publishDoc;
};

const revokePublicDoc = async (workspaceId: string, docId: string) => {
  const { revokePublicDoc } = await app.gql({
    query: revokePublicPageMutation,
    variables: {
      workspaceId,
      pageId: docId,
    },
  });

  return revokePublicDoc;
};

const revokeMember = async (workspaceId: string, userId: string) => {
  const { revokeMember } = await app.gql({
    query: revokeMemberPermissionMutation,
    variables: {
      workspaceId,
      userId,
    },
  });

  return revokeMember;
};

const cancelTeamWorkspace = async (workspaceId: string) => {
  await app.get(EntitlementService).revokeAdminGrant('workspace', workspaceId);
  await app.eventBus.emitAsync('workspace.subscription.canceled', {
    workspaceId,
    plan: SubscriptionPlan.Team,
    recurring: SubscriptionRecurring.Monthly,
  });
};

teamE2E('should reject invitations beyond the charged seat limit', async t => {
  const { owner, workspace } = await createTeamWorkspace();
  await app.login(owner);

  const u1 = await app.createUser();

  await t.throwsAsync(
    app.gql({
      query: inviteByEmailsMutation,
      variables: {
        workspaceId: workspace.id,
        emails: [u1.email],
      },
    }),
    { message: /No more seat available/ }
  );
});

teamE2E(
  'should cleanup non-accepted members when team workspace is downgraded',
  async t => {
    const { workspace } = await createTeamWorkspace();

    const pending = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: pending.id,
      workspaceId: workspace.id,
      status: WorkspaceMemberStatus.Pending,
    });

    const allocating = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: allocating.id,
      workspaceId: workspace.id,
      status: WorkspaceMemberStatus.AllocatingSeat,
    });

    const underReview = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: underReview.id,
      workspaceId: workspace.id,
      status: WorkspaceMemberStatus.UnderReview,
    });

    await cancelTeamWorkspace(workspace.id);

    const [members] = await app.models.workspaceUser.paginate(workspace.id, {
      first: 20,
      offset: 0,
    });

    t.deepEqual(
      members.map(member => member.status),
      [
        WorkspaceMemberStatus.Accepted,
        WorkspaceMemberStatus.Accepted,
        WorkspaceMemberStatus.Accepted,
      ]
    );
    t.false(await app.models.workspace.isTeamWorkspace(workspace.id));
  }
);

teamE2E(
  'should demote accepted admins and keep workspace writable when downgrade stays within owner quota',
  async t => {
    const { workspace, owner, admin } = await createTeamWorkspace();

    await cancelTeamWorkspace(workspace.id);

    t.false(await app.models.workspace.isTeamWorkspace(workspace.id));
    t.false(
      (
        await app
          .get(BackendRuntimeProvider)
          .getWorkspaceQuotaStateV1(workspace.id)
      ).readonly
    );
    t.is(
      (await app.models.workspaceUser.get(workspace.id, admin.id))?.type,
      WorkspaceRole.Collaborator
    );

    await app.create(Mockers.DocSnapshot, {
      workspaceId: workspace.id,
      docId: 'doc-1',
      user: owner,
    });
    await app.login(owner);
    await t.notThrowsAsync(publishDoc(workspace.id, 'doc-1'));
  }
);

teamE2E(
  'should enter readonly mode on over-quota team downgrade and recover through cleanup actions',
  async t => {
    const { workspace, owner, admin } = await createTeamWorkspace(20);
    const extraMembers = await Promise.all(
      Array.from({ length: 8 }).map(async () => {
        const member = await app.create(Mockers.User);
        await app.create(Mockers.WorkspaceUser, {
          workspaceId: workspace.id,
          userId: member.id,
        });
        return member;
      })
    );

    await app.login(owner);
    await Promise.all(
      ['published-doc', 'blocked-doc'].map(docId =>
        app.create(Mockers.DocSnapshot, {
          workspaceId: workspace.id,
          docId,
          user: owner,
        })
      )
    );
    await publishDoc(workspace.id, 'published-doc');

    await cancelTeamWorkspace(workspace.id);

    t.false(await app.models.workspace.isTeamWorkspace(workspace.id));
    t.true(
      (
        await app
          .get(BackendRuntimeProvider)
          .getWorkspaceQuotaStateV1(workspace.id)
      ).readonly
    );
    t.is(
      (await app.models.workspaceUser.get(workspace.id, admin.id))?.type,
      WorkspaceRole.Collaborator
    );

    await t.throwsAsync(publishDoc(workspace.id, 'blocked-doc'));
    await t.notThrowsAsync(revokePublicDoc(workspace.id, 'published-doc'));

    const quota = await app
      .get(QuotaService)
      .getWorkspaceQuotaWithUsage(workspace.id);
    for (const member of extraMembers.slice(0, quota.overcapacityMemberCount)) {
      await revokeMember(workspace.id, member.id);
    }

    t.false(
      (
        await app
          .get(BackendRuntimeProvider)
          .getWorkspaceQuotaStateV1(workspace.id)
      ).readonly
    );
  }
);
