import { createHash } from 'node:crypto';

import {
  createInviteLinkMutation,
  inviteByEmailsMutation,
  WorkspaceInviteLinkExpireTime,
} from '@affine/graphql';
import { PrismaClient, WorkspaceMemberStatus } from '@prisma/client';
import ava from 'ava';
import type { Request } from 'express';
import Sinon from 'sinon';

import { createApp, type TestingApp } from '../../../__tests__/e2e/test';
import { Mockers } from '../../../__tests__/mocks';
import { Config } from '../../../base';
import { ActionForbidden, TooManyRequest } from '../../../base/error';
import { Models, WorkspaceRole } from '../../../models';
import { BackendRuntimeProvider } from '../../backend-runtime';
import { QuotaService } from '../../quota';
import {
  getAbuseRequestSource,
  InviteAbuseDispositionService,
  InviteQuotaAssertService,
} from '../abuse';

let app: TestingApp;
const test = ava.serial;
const quota = {
  assertWorkspaceInviteLinkAllowed: Sinon.stub(),
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
  quota.assertWorkspaceInviteLinkAllowed.reset();
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
  const runtime = app.get(BackendRuntimeProvider);
  const invalidateSeatUsage = Sinon.stub(
    runtime,
    'quotaSeatUsageTransitionV1'
  ).resolves();

  for (const scenario of [
    {
      name: 'actor',
      subjectKind: 'actor_email',
      action: 'quarantine_actor',
      reason: 'high_risk_domain_burst',
    },
    {
      name: 'workspace',
      subjectKind: 'workspace',
      action: 'quarantine_workspace',
      reason: 'workspace_high_risk_domain_burst',
    },
  ] as const) {
    const actor = await app.create(Mockers.User);
    const invitee = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, { owner: actor });
    const actorEmailHash = `actor_email_sha256:v1:${createHash('sha256').update(actor.id).digest('hex')}`;
    const subjectKey =
      scenario.name === 'actor'
        ? actorEmailHash
        : workspaceSubjectKey(workspace.id);
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
      abuseSubjectKey: subjectKey,
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
          email_domain,
          status,
          action,
          action_reason,
          first_seen_at,
          last_seen_at
        )
        VALUES (${subjectKey}, ${scenario.subjectKind}, ${scenario.name === 'actor' ? actor.id : null}, ${actorEmailHash}, 'example.com', 'quarantined', ${scenario.action}, ${scenario.reason}, now(), now())
        ON CONFLICT (subject_key) DO NOTHING
        RETURNING subject_key
      ),
      evidence AS (
        INSERT INTO runtime_invite_abuse_evidence (
          subject_key,
          workspace_id,
          user_id,
          actor_email_hash,
          target_domains,
          counters,
          decision,
          reason
        )
        VALUES (${subjectKey}, ${workspace.id}, ${actor.id}, ${actorEmailHash}, '[{"domain":"qq.com","count":1}]'::jsonb, '{"requested":1}'::jsonb, ${scenario.action}, ${scenario.reason})
        RETURNING id
      )
      INSERT INTO runtime_invite_abuse_actions (
        subject_key,
        evidence_id,
        action,
        status
      )
      SELECT ${subjectKey}, evidence.id, ${scenario.action}, 'pending'
      FROM evidence
      RETURNING id
    `;
    await disposition.execute({
      actorUserId: actor.id,
      workspaceId: workspace.id,
      actionRequired: {
        action: scenario.action,
        subjectKey,
        evidenceId: '1',
        actionId: actionId.toString(),
      },
    });
    t.deepEqual(
      invalidateSeatUsage.lastCall.args[0].toSorted(),
      (scenario.name === 'actor'
        ? [workspace.id, anotherWorkspace.id]
        : [workspace.id]
      ).toSorted(),
      scenario.action
    );

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
  const actorEmailHash = `actor_email_sha256:v1:${createHash('sha256').update(owner.id).digest('hex')}`;
  await db.$executeRaw`
    WITH subject AS (
      INSERT INTO runtime_invite_abuse_subjects (
        subject_key,
        kind,
        actor_email_hash,
        email_domain,
        status,
        action,
        action_reason,
        first_seen_at,
        last_seen_at
      )
      VALUES (${subjectKey}, 'workspace', ${actorEmailHash}, 'example.com', 'quarantined', 'quarantine_workspace', 'workspace_high_risk_domain_burst', now(), now())
      ON CONFLICT (subject_key)
      DO UPDATE SET
        status = 'quarantined',
        updated_at = now()
      RETURNING subject_key
    )
    INSERT INTO runtime_invite_abuse_evidence (
      subject_key,
      workspace_id,
      user_id,
      actor_email_hash,
      target_domains,
      counters,
      decision,
      reason
    )
    SELECT subject_key, ${workspace.id}, ${owner.id}, ${actorEmailHash}, '[{"domain":"qq.com","count":1}]'::jsonb, '{"requested":1}'::jsonb, 'quarantine_workspace', 'workspace_high_risk_domain_burst'
    FROM subject
  `;

  const previousDelay = config.auth.newAccountActionDelay;
  config.auth.newAccountActionDelay = 0;
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
    config.auth.newAccountActionDelay = previousDelay;
  }
});

test('workspace action admission maps native allow and deny decisions', async t => {
  const evaluateWorkspaceInviteLinkV1 = Sinon.stub();
  evaluateWorkspaceInviteLinkV1.onFirstCall().resolves({
    allowed: false,
    reason: 'new_account_action_delay',
    retryAfterSeconds: 60,
  });
  evaluateWorkspaceInviteLinkV1.onSecondCall().resolves({ allowed: true });
  const inviteQuota = new InviteQuotaAssertService(
    {} as unknown as QuotaService,
    { evaluateWorkspaceInviteLinkV1 } as unknown as BackendRuntimeProvider,
    {} as unknown as InviteAbuseDispositionService
  );
  const input = { actorUserId: 'actor', workspaceId: 'workspace' };

  await t.throwsAsync(inviteQuota.assertWorkspaceInviteLinkAllowed(input), {
    instanceOf: ActionForbidden,
  });
  await t.notThrowsAsync(inviteQuota.assertWorkspaceInviteLinkAllowed(input));
  t.true(
    evaluateWorkspaceInviteLinkV1.alwaysCalledWithExactly('actor', 'workspace')
  );
});
test('invite link mutation uses native invite-link admission', async t => {
  const realApp = await createApp();
  try {
    const owner = await realApp.create(Mockers.User);
    const workspace = await realApp.create(Mockers.Workspace, { owner });
    await realApp.login(owner);
    await t.throwsAsync(
      realApp.gql({
        query: createInviteLinkMutation,
        variables: {
          workspaceId: workspace.id,
          expireTime: WorkspaceInviteLinkExpireTime.OneDay,
        },
      })
    );
  } finally {
    await realApp.close();
  }
});
