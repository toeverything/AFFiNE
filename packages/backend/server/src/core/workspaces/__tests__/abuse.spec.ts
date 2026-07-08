import { createHash } from 'node:crypto';

import {
  createInviteLinkMutation,
  inviteByEmailsMutation,
  WorkspaceInviteLinkExpireTime,
} from '@affine/graphql';
import { PrismaClient, WorkspaceMemberStatus } from '@prisma/client';
import test from 'ava';
import type { Request } from 'express';
import Sinon from 'sinon';

import { createApp, type TestingApp } from '../../../__tests__/e2e/test';
import { Mockers } from '../../../__tests__/mocks';
import { Config } from '../../../base';
import { ActionForbidden, TooManyRequest } from '../../../base/error';
import { Models, WorkspaceRole } from '../../../models';
import {
  getAbuseRequestSource,
  InviteAbuseDispositionService,
  InviteQuotaAssertService,
} from '../abuse';

let app: TestingApp;
const quota = {
  assertWorkspaceInviteQuota: Sinon.stub(),
  commitWorkspaceInviteQuota: Sinon.stub(),
  releaseWorkspaceInviteQuota: Sinon.stub(),
};

function workspaceSubjectKey(workspaceId: string) {
  return `workspace:v1:${createHash('sha256').update(workspaceId).digest('hex').slice(0, 24)}`;
}

test.before(async () => {
  app = await createApp({
    tapModule: builder => {
      builder.overrideProvider(InviteQuotaAssertService).useValue(quota);
    },
  });
});

test.beforeEach(() => {
  quota.assertWorkspaceInviteQuota.reset();
  quota.commitWorkspaceInviteQuota.reset();
  quota.releaseWorkspaceInviteQuota.reset();
});

test.after.always(async () => {
  await app.close();
});

test('invite quota rejection has no invite side effects', async t => {
  quota.assertWorkspaceInviteQuota.rejects(new TooManyRequest());
  const models = app.get(Models);
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  const targetEmail = `quota-${Date.now()}@example.com`;

  await app.login(owner);
  await t.throwsAsync(
    app.gql({
      query: inviteByEmailsMutation,
      variables: {
        workspaceId: workspace.id,
        emails: [targetEmail],
      },
    })
  );

  t.is(await models.user.getUserByEmail(targetEmail), null);
  t.is(await models.workspaceUser.count(workspace.id), 1);
  t.is(app.mails.send.callCount, 0);
  t.is(app.queue.count('notification.sendInvitation'), 0);
  t.is(quota.commitWorkspaceInviteQuota.callCount, 0);
  t.is(quota.releaseWorkspaceInviteQuota.callCount, 0);
});

test('abuse request source trusts Cloudflare facts only when configured', t => {
  const config = app.get(Config);
  const previousTrusted = config.auth.trustedCloudflareHeaders;
  const req = {
    ip: '10.0.0.1',
    get(name: string) {
      return (
        {
          'CF-Connecting-IP': '114.51.41.91',
          'CF-IPCountry': 'JP',
          'CF-Ray': 'ray-id',
          'x-affine-cf-asn': '4294967295',
          'X-Forwarded-For': '198.51.100.9',
        } satisfies Record<string, string>
      )[name];
    },
  } as Request;

  try {
    config.auth.trustedCloudflareHeaders = false;
    t.deepEqual(getAbuseRequestSource(req, config), { trusted: false });

    config.auth.trustedCloudflareHeaders = true;
    t.deepEqual(getAbuseRequestSource(req, config), {
      trusted: true,
      ip: '114.51.41.91',
      country: 'JP',
      asn: 4294967295,
      rayId: 'ray-id',
    });
  } finally {
    config.auth.trustedCloudflareHeaders = previousTrusted;
  }
});

test('invite quota rejection keeps mapped response when disposition fails', async t => {
  const service = new InviteQuotaAssertService(
    app.get(Config),
    {
      getWorkspaceSeatQuota: Sinon.stub().resolves({
        memberLimit: 10,
        memberCount: 1,
      }),
    } as any,
    {
      assertWorkspaceInviteQuotaV1: Sinon.stub().resolves({
        allowed: false,
        reason: 'abuse_subject',
        actionRequired: {
          action: 'quarantine_actor',
          actionId: '1',
          subjectKey: 'subject',
          evidenceId: '1',
        },
      }),
    } as any,
    {
      execute: Sinon.stub().rejects(new Error('disposition failed')),
    } as any
  );

  await t.throwsAsync(
    service.assertWorkspaceInviteQuota({
      actorUserId: 'actor',
      workspaceId: 'workspace',
      targetCount: 1,
      targetDomains: [{ domain: 'example.com', count: 1 }],
    }),
    { instanceOf: ActionForbidden }
  );
});

test('abuse disposition applies action scope to invitation artifacts', async t => {
  const models = app.get(Models);
  const db = app.get(PrismaClient);
  const disposition = app.get(InviteAbuseDispositionService);

  for (const scenario of [
    {
      name: 'actor',
      subjectKey: 'actor-subject',
      subjectKind: 'actor_email',
      action: 'quarantine_actor',
    },
    {
      name: 'workspace',
      subjectKey: 'workspace-subject',
      subjectKind: 'workspace',
      action: 'quarantine_workspace',
    },
  ] as const) {
    const actor = await app.create(Mockers.User);
    const invitee = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, { owner: actor });
    const anotherWorkspace = await app.create(Mockers.Workspace, {
      owner: actor,
    });
    await models.workspaceInvitation.set(
      workspace.id,
      invitee.id,
      WorkspaceRole.Collaborator,
      WorkspaceMemberStatus.Pending,
      { inviterId: actor.id }
    );
    await models.workspaceInvitation.set(
      anotherWorkspace.id,
      invitee.id,
      WorkspaceRole.Collaborator,
      WorkspaceMemberStatus.Pending,
      { inviterId: actor.id }
    );
    const canceledDelivery = await models.mailDelivery.create({
      mailName: 'MemberInvitation',
      mailClass: 'workspace_invitation',
      priority: 'normal',
      recipientEmail: invitee.email,
      actorUserId: actor.id,
      workspaceId: workspace.id,
      abuseSubjectKey: scenario.subjectKey,
      payload: {
        name: 'MemberInvitation',
        to: invitee.email,
        props: {
          url: 'https://affine.pro/invite',
          user: { $$userId: actor.id },
          workspace: { $$workspaceId: workspace.id },
        },
      },
    });
    const otherDelivery =
      scenario.name === 'workspace'
        ? await models.mailDelivery.create({
            mailName: 'MemberInvitation',
            mailClass: 'workspace_invitation',
            priority: 'normal',
            recipientEmail: invitee.email,
            actorUserId: actor.id,
            workspaceId: anotherWorkspace.id,
            abuseSubjectKey: 'other-workspace-subject',
            payload: {
              name: 'MemberInvitation',
              to: invitee.email,
              props: {
                url: 'https://affine.pro/invite',
                user: { $$userId: actor.id },
                workspace: { $$workspaceId: anotherWorkspace.id },
              },
            },
          })
        : null;
    const [{ id: actionId }] = await db.$queryRaw<Array<{ id: bigint }>>`
      WITH subject AS (
        INSERT INTO runtime_invite_abuse_subjects (
          subject_key,
          kind,
          user_id,
          actor_email_hash,
          status,
          first_seen_at,
          last_seen_at
        )
        VALUES (${scenario.subjectKey}, ${scenario.subjectKind}, ${actor.id}, 'hash', 'quarantined', now(), now())
        ON CONFLICT (subject_key) DO NOTHING
        RETURNING subject_key
      ),
      evidence AS (
        INSERT INTO runtime_invite_abuse_evidence (
          subject_key,
          workspace_id,
          user_id,
          actor_email_hash,
          decision,
          reason
        )
        VALUES (${scenario.subjectKey}, ${workspace.id}, ${actor.id}, 'hash', ${scenario.action}, 'test')
        RETURNING id
      )
      INSERT INTO runtime_invite_abuse_actions (
        subject_key,
        evidence_id,
        action,
        status
      )
      SELECT ${scenario.subjectKey}, evidence.id, ${scenario.action}, 'pending'
      FROM evidence
      RETURNING id
    `;

    await disposition.execute({
      actorUserId: actor.id,
      workspaceId: workspace.id,
      actionRequired: {
        action: scenario.action,
        subjectKey: scenario.subjectKey,
        evidenceId: '1',
        actionId: actionId.toString(),
      },
    });

    if (scenario.name === 'actor') {
      t.is(
        await db.workspaceInvitation.count({
          where: { inviterUserId: actor.id },
        }),
        0,
        scenario.action
      );
    } else {
      t.is(
        await db.workspaceInvitation.count({
          where: { workspaceId: workspace.id },
        }),
        0,
        scenario.action
      );
      t.is(
        await db.workspaceInvitation.count({
          where: { workspaceId: anotherWorkspace.id },
        }),
        1,
        scenario.action
      );
    }
    t.is(
      (
        await db.mailDelivery.findUniqueOrThrow({
          where: { id: canceledDelivery.id },
        })
      ).status,
      'canceled',
      scenario.action
    );
    if (otherDelivery) {
      t.is(
        (
          await db.mailDelivery.findUniqueOrThrow({
            where: { id: otherDelivery.id },
          })
        ).status,
        'queued',
        scenario.action
      );
    }
  }
});

test('workspace quarantine blocks invite link creation', async t => {
  const db = app.get(PrismaClient);
  const config = app.get(Config);
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, { owner });
  const subjectKey = workspaceSubjectKey(workspace.id);
  await db.$executeRaw`
    INSERT INTO runtime_invite_abuse_subjects (
      subject_key,
      kind,
      status,
      first_seen_at,
      last_seen_at
    )
    VALUES (${subjectKey}, 'workspace', 'quarantined', now(), now())
    ON CONFLICT (subject_key)
    DO UPDATE SET
      status = 'quarantined',
      updated_at = now()
  `;

  const previousDelay = config.auth.newAccountShareActionDelay;
  config.auth.newAccountShareActionDelay = 0;
  try {
    await app.login(owner);
    await t.throwsAsync(
      app.gql({
        query: createInviteLinkMutation,
        variables: {
          workspaceId: workspace.id,
          expireTime: WorkspaceInviteLinkExpireTime.OneDay,
        },
      })
    );
  } finally {
    config.auth.newAccountShareActionDelay = previousDelay;
  }
});

test('domain workspace name blocks invite link creation', async t => {
  const config = app.get(Config);
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner,
    name: 'Join example.com',
  });

  const previousDelay = config.auth.newAccountShareActionDelay;
  config.auth.newAccountShareActionDelay = 0;
  try {
    await app.login(owner);
    await t.throwsAsync(
      app.gql({
        query: createInviteLinkMutation,
        variables: {
          workspaceId: workspace.id,
          expireTime: WorkspaceInviteLinkExpireTime.OneDay,
        },
      })
    );
  } finally {
    config.auth.newAccountShareActionDelay = previousDelay;
  }
});
