import test from 'ava';
import Sinon from 'sinon';

import { QuotaService } from '../service';

const userState = {
  plan: 'free',
  seatLimit: 3,
  blobLimit: 10n,
  storageQuota: 100n,
  usedStorageQuota: 25n,
  historyPeriodSeconds: 86_400,
  copilotActionLimit: 7,
  unlimitedCopilot: false,
};

const workspaceState = {
  plan: 'free',
  ownerUserId: 'owner',
  usesOwnerQuota: true,
  seatLimit: 3,
  memberCount: 2,
  overcapacityMemberCount: 0,
  blobLimit: 10n,
  storageQuota: 100n,
  usedStorageQuota: 25n,
  historyPeriodSeconds: 86_400,
  readonly: false,
  readonlyReasons: [],
  unlimitedCopilot: false,
};

test('QuotaService maps native user plans and numeric fields', async t => {
  const getUserQuotaStateV1 = Sinon.stub();
  const service = new QuotaService({ getUserQuotaStateV1 } as never);

  for (const [plan, name, memberLimit] of [
    ['free', 'Free', 3],
    ['pro', 'Pro', 10],
    ['lifetime_pro', 'Lifetime Pro', 10],
    ['ai', 'AI', 3],
    ['team', 'Team', 3],
    ['selfhost_free', 'Pro', 10],
    ['selfhost_team', 'Team', 3],
  ] as const) {
    getUserQuotaStateV1.resolves({
      ...userState,
      plan,
      seatLimit: memberLimit,
    });
    const quota = await service.getUserQuotaWithUsage('user');
    t.deepEqual(
      {
        name: quota.name,
        memberLimit: quota.memberLimit,
        blobLimit: quota.blobLimit,
        storageQuota: quota.storageQuota,
        usedStorageQuota: quota.usedStorageQuota,
        historyPeriod: quota.historyPeriod,
        copilotActionLimit: quota.copilotActionLimit,
      },
      {
        name,
        memberLimit,
        blobLimit: 10,
        storageQuota: 100,
        usedStorageQuota: 25,
        historyPeriod: 86_400,
        copilotActionLimit: 7,
      },
      plan
    );
  }

  getUserQuotaStateV1.resolves({
    ...userState,
    unlimitedCopilot: true,
  });
  t.is((await service.getUserQuota('user')).copilotActionLimit, undefined);
});

test('QuotaService maps workspace ownership, usage and display values', async t => {
  const getWorkspaceQuotaStateV1 = Sinon.stub().resolves(workspaceState);
  const service = new QuotaService({ getWorkspaceQuotaStateV1 } as never);

  const quota = await service.getWorkspaceQuotaWithUsage('workspace');
  t.deepEqual(quota, {
    name: 'Free',
    blobLimit: 10,
    storageQuota: 100,
    historyPeriod: 86_400,
    memberLimit: 3,
    ownerQuota: 'owner',
    usedStorageQuota: 25,
    memberCount: 2,
    overcapacityMemberCount: 0,
  });
  t.deepEqual(service.formatWorkspaceQuota(quota), {
    name: 'Free',
    blobLimit: '10 B',
    storageQuota: '100 B',
    storageQuotaUsed: '25 B',
    historyPeriod: '1 days',
    memberLimit: '3',
    memberCount: '2',
    overcapacityMemberCount: '0',
  });

  getWorkspaceQuotaStateV1.resolves({
    ...workspaceState,
    plan: 'team',
    usesOwnerQuota: false,
  });
  t.deepEqual(await service.getWorkspaceQuota('workspace'), {
    name: 'Team',
    blobLimit: 10,
    storageQuota: 100,
    historyPeriod: 86_400,
    memberLimit: 3,
    ownerQuota: undefined,
  });
});

test('QuotaService projects usage, seats and user display values', async t => {
  const runtime = {
    getUserQuotaStateV1: Sinon.stub().resolves(userState),
    getWorkspaceQuotaStateV1: Sinon.stub().resolves(workspaceState),
  };
  const service = new QuotaService(runtime as never);

  t.is(await service.getUserStorageUsage('user'), 25);
  t.is(await service.getWorkspaceStorageUsage('workspace'), 25);
  t.deepEqual(await service.getWorkspaceSeatQuota('workspace'), {
    memberCount: 2,
    memberLimit: 3,
  });
  t.deepEqual(
    service.formatUserQuota({
      name: 'Free',
      blobLimit: 10,
      storageQuota: 100,
      usedStorageQuota: 25,
      historyPeriod: 86_400,
      memberLimit: 3,
      copilotActionLimit: 7,
    }),
    {
      name: 'Free',
      blobLimit: '10 B',
      storageQuota: '100 B',
      usedStorageQuota: '25 B',
      historyPeriod: '1 days',
      memberLimit: '3',
      copilotActionLimit: '7 times',
    }
  );
});
