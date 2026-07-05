import test from 'ava';
import Sinon from 'sinon';

import { Mockers } from '../../../__tests__/mocks';
import { createTestingModule } from '../../../__tests__/utils';
import { Cache } from '../../../base';
import { Models } from '../../../models';
import { MailJob } from '../job';
import { MailSender } from '../sender';

let module: Awaited<ReturnType<typeof createTestingModule>>;
let cache: Cache;
let mailJob: MailJob;
let sender: MailSender;
let models: Models;

test.before(async () => {
  module = await createTestingModule();
  cache = module.get(Cache);
  mailJob = module.get(MailJob);
  sender = module.get(MailSender);
  models = module.get(Models);
});

test.after.always(async () => {
  await module.close();
});

test.afterEach(() => {
  Sinon.restore();
});

test('should clear pending mail records when user is deleted', async t => {
  const user = await module.create(Mockers.User);
  const another = await module.create(Mockers.User);
  const sendMailKey = 'mailjob:sendMail';
  const retryMailKey = 'mailjob:sendMail:retry';
  const userKey = `${sendMailKey}:SignIn:${user.email}`;
  const userRetryKey = `${sendMailKey}:VerifyEmail:${user.email}`;
  const anotherKey = `${sendMailKey}:SignIn:${another.email}`;
  const senderRetryKey = `${retryMailKey}:MemberInvitation:invited@affine.pro`;

  await cache.mapSet(sendMailKey, userKey, 1);
  await cache.mapSet(sendMailKey, anotherKey, 1);
  await cache.mapSet(
    retryMailKey,
    userRetryKey,
    JSON.stringify({
      startTime: Date.now(),
      name: 'VerifyEmail',
      to: user.email,
      props: { url: 'https://affine.pro/verify' },
    })
  );
  await cache.mapSet(
    retryMailKey,
    senderRetryKey,
    JSON.stringify({
      startTime: Date.now(),
      name: 'MemberInvitation',
      to: 'invited@affine.pro',
      props: {
        user: { $$userId: user.id },
        workspace: { $$workspaceId: 'workspace-id' },
        url: 'https://affine.pro/invite',
      },
    })
  );

  await mailJob.onUserDeleted({ ...user, ownedWorkspaces: [] });

  t.true(module.queue.removeWhere.calledOnce);
  t.is(module.queue.removeWhere.firstCall.args[0], 'notification.sendMail');
  const shouldRemove = module.queue.removeWhere.firstCall.args[1];
  t.true(
    await shouldRemove({
      to: user.email,
    } as Jobs['notification.sendMail'])
  );
  t.true(
    await shouldRemove({
      name: 'MemberInvitation',
      to: 'invited@affine.pro',
      props: {
        user: { $$userId: user.id },
        workspace: { $$workspaceId: 'workspace-id' },
        url: 'https://affine.pro/invite',
      },
    } as Jobs['notification.sendMail'])
  );
  t.false(
    await shouldRemove({
      to: another.email,
    } as Jobs['notification.sendMail'])
  );
  t.is(await cache.mapGet(sendMailKey, userKey), undefined);
  t.is(await cache.mapGet(retryMailKey, userRetryKey), undefined);
  t.is(await cache.mapGet(retryMailKey, senderRetryKey), undefined);
  t.is(await cache.mapGet(sendMailKey, anotherKey), 1);
});

test('should skip queued mail for disabled recipient', async t => {
  const user = await module.create(Mockers.User, { disabled: true });
  const send = Sinon.stub(sender, 'send').resolves(true);

  await mailJob.sendMail({
    startTime: Date.now(),
    name: 'SignIn',
    to: user.email,
    props: {
      url: 'https://affine.pro/sign-in',
      otp: '123456',
    },
  });

  t.false(send.called);
  t.truthy(await models.user.get(user.id, { withDisabled: true }));
});

test('should drop expired mail retry', async t => {
  const send = Sinon.stub(sender, 'send').resolves(true);

  await mailJob.sendMail({
    startTime: Date.now() - 25 * 60 * 60 * 1000,
    name: 'SignIn',
    to: 'expired-retry@example.com',
    props: {
      url: 'https://affine.pro/sign-in',
      otp: '123456',
    },
  });

  t.false(send.called);
});

test('should drop time-sensitive mail after its business expiration', async t => {
  const send = Sinon.stub(sender, 'send').resolves(true);

  await mailJob.sendMail({
    startTime: Date.now() - 31 * 60 * 1000,
    name: 'SignIn',
    to: 'expired-sign-in@example.com',
    props: {
      url: 'https://affine.pro/sign-in',
      otp: '123456',
    },
  });

  t.false(send.called);
});

test('should use explicit mail expiration when provided', async t => {
  const send = Sinon.stub(sender, 'send').resolves(true);

  await mailJob.sendMail({
    startTime: Date.now(),
    expiresAt: Date.now() - 1,
    name: 'MemberInvitation',
    to: 'expired-invitation@example.com',
    props: {
      user: {
        $$userId: 'owner-id',
      },
      workspace: {
        $$workspaceId: 'workspace-id',
      },
      url: 'https://affine.pro/invite/test',
    },
  });

  t.false(send.called);
});

test('should drop mail retry after max attempts', async t => {
  const send = Sinon.stub(sender, 'send').resolves(true);

  await mailJob.sendMail({
    startTime: Date.now(),
    retryCount: 12,
    name: 'SignIn',
    to: 'max-retry@example.com',
    props: {
      url: 'https://affine.pro/sign-in',
      otp: '123456',
    },
  });

  t.false(send.called);
});

test('should requeue legacy stringified retry mail', async t => {
  const retryMailKey = 'mailjob:sendMail:retry';
  const job: Jobs['notification.sendMail'] = {
    startTime: Date.now(),
    name: 'SignIn',
    to: 'legacy-retry@example.com',
    props: {
      url: 'https://affine.pro/sign-in',
      otp: '123456',
    },
  };
  const cacheKey = `${retryMailKey}:SignIn:${job.to}`;

  Sinon.stub(cache, 'mapRandomKey')
    .onFirstCall()
    .resolves(cacheKey)
    .onSecondCall()
    .resolves(undefined);
  await cache.mapSet(retryMailKey, cacheKey, JSON.stringify(job));
  await mailJob.sendRetryMails();

  t.true(module.queue.add.calledWith('notification.sendMail', job));
  t.is(await cache.mapGet(retryMailKey, cacheKey), undefined);
});

test('should skip member invitation mail when rendered workspace name contains domain', async t => {
  const owner = await module.create(Mockers.User);
  const member = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: owner.id },
    name: 'BTC https://spam.example',
  });
  const send = Sinon.stub(sender, 'send').resolves(true);

  await mailJob.sendMail({
    startTime: Date.now(),
    name: 'MemberInvitation',
    to: member.email,
    props: {
      user: {
        $$userId: owner.id,
      },
      workspace: {
        $$workspaceId: workspace.id,
      },
      url: 'https://affine.pro/invite/test',
    },
  });

  t.false(send.called);
});

test('should keep dynamic mail props untouched for retry', async t => {
  const owner = await module.create(Mockers.User);
  const member = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: owner.id },
    name: 'Safe Workspace',
  });
  Sinon.stub(sender, 'send').resolves(false);
  const job: Jobs['notification.sendMail'] = {
    startTime: Date.now(),
    name: 'MemberInvitation',
    to: member.email,
    props: {
      user: {
        $$userId: owner.id,
      },
      workspace: {
        $$workspaceId: workspace.id,
      },
      url: 'https://affine.pro/invite/test',
    },
  };

  await mailJob.sendMail(job);

  t.deepEqual(job.props.user, { $$userId: owner.id });
  t.deepEqual(job.props.workspace, { $$workspaceId: workspace.id });
});
