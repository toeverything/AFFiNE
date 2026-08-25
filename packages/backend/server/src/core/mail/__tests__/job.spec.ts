import { Prisma, PrismaClient } from '@prisma/client';
import test from 'ava';
import Sinon from 'sinon';

import { Mockers } from '../../../__tests__/mocks';
import { createTestingModule } from '../../../__tests__/utils';
import { Models } from '../../../models';
import { MailJob } from '../job';
import { MailSender } from '../sender';

let module: Awaited<ReturnType<typeof createTestingModule>>;
let mailJob: MailJob;
let sender: MailSender;
let models: Models;
let db: PrismaClient;

test.before(async () => {
  module = await createTestingModule();
  mailJob = module.get(MailJob);
  sender = module.get(MailSender);
  models = module.get(Models);
  db = module.get(PrismaClient);
});

test.after.always(async () => {
  await module.close();
});

test.afterEach.always(async () => {
  Sinon.restore();
  await db.mailDelivery.deleteMany();
});

async function createDelivery(
  input: {
    name: 'SignIn' | 'VerifyEmail' | 'MemberInvitation';
    to: string;
    props: Record<string, unknown>;
  },
  overrides: Partial<Parameters<Models['mailDelivery']['create']>[0]> = {}
) {
  const mailClass =
    input.name === 'MemberInvitation' ? 'workspace_invitation' : 'auth';
  return await models.mailDelivery.create({
    mailName: input.name,
    mailClass,
    priority: mailClass === 'auth' ? 'critical' : 'normal',
    recipientEmail: input.to,
    payload: input as Prisma.JsonObject,
    ...overrides,
  });
}

async function delivery(id: string) {
  return await db.mailDelivery.findUniqueOrThrow({ where: { id } });
}

test('should cancel pending mail deliveries when user is deleted', async t => {
  const user = await module.create(Mockers.User);
  const another = await module.create(Mockers.User);
  const recipientDelivery = await createDelivery({
    name: 'SignIn',
    to: user.email,
    props: { url: 'https://affine.pro/sign-in', otp: '123456' },
  });
  const senderDelivery = await createDelivery(
    {
      name: 'MemberInvitation',
      to: 'invited@affine.pro',
      props: {
        user: { $$userId: user.id },
        workspace: { $$workspaceId: 'workspace-id' },
        url: 'https://affine.pro/invite',
      },
    },
    { actorUserId: user.id }
  );
  const anotherDelivery = await createDelivery({
    name: 'SignIn',
    to: another.email,
    props: { url: 'https://affine.pro/sign-in', otp: '123456' },
  });

  await mailJob.onUserDeleted({ ...user, ownedWorkspaces: [] });

  t.is((await delivery(recipientDelivery.id)).status, 'canceled');
  t.is((await delivery(senderDelivery.id)).status, 'canceled');
  t.is((await delivery(anotherDelivery.id)).status, 'queued');
  t.is((await delivery(recipientDelivery.id)).recipientEmail, null);
  t.is((await delivery(senderDelivery.id)).payload, null);
});

test('should skip queued mail for disabled recipient', async t => {
  const user = await module.create(Mockers.User, { disabled: true });
  const send = Sinon.stub(sender, 'send').resolves({
    status: 'accepted',
    retryable: false,
  });
  const row = await createDelivery({
    name: 'SignIn',
    to: user.email,
    props: { url: 'https://affine.pro/sign-in', otp: '123456' },
  });

  await mailJob.processReadyDeliveries();

  const updated = await delivery(row.id);
  t.false(send.called);
  t.is(updated.status, 'skipped');
  t.is(updated.lastErrorCode, 'disabled_recipient');
  t.is(updated.recipientEmail, null);
  t.is(updated.payload, null);
});

test('should not create sendable row for expired mail', async t => {
  const send = Sinon.stub(sender, 'send').resolves({
    status: 'accepted',
    retryable: false,
  });
  const row = await createDelivery(
    {
      name: 'SignIn',
      to: 'expired-retry@example.com',
      props: { url: 'https://affine.pro/sign-in', otp: '123456' },
    },
    { expiresAt: new Date(Date.now() - 1) }
  );

  await mailJob.processReadyDeliveries();

  const updated = await delivery(row.id);
  t.false(send.called);
  t.is(updated.status, 'failed');
  t.is(updated.lastErrorCode, 'expired');
  t.is(updated.retentionState, 'anonymized');
});

test('should not claim delivery when max attempts is zero', async t => {
  const send = Sinon.stub(sender, 'send').resolves({
    status: 'accepted',
    retryable: false,
  });
  const row = await createDelivery(
    {
      name: 'SignIn',
      to: 'max-attempts@example.com',
      props: { url: 'https://affine.pro/sign-in', otp: '123456' },
    },
    { maxAttempts: 0 }
  );

  await mailJob.processReadyDeliveries();

  t.false(send.called);
  t.is((await delivery(row.id)).status, 'queued');
});

test('should retry retryable send failures without mutating stored dynamic props', async t => {
  const owner = await module.create(Mockers.User);
  const member = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: owner.id },
    name: 'Safe Workspace',
  });
  Sinon.stub(sender, 'send').resolves({
    status: 'failed',
    retryable: true,
    errorCode: 'transport_failed',
    error: 'temporary failure',
  });
  const row = await createDelivery(
    {
      name: 'MemberInvitation',
      to: member.email,
      props: {
        user: { $$userId: owner.id },
        workspace: { $$workspaceId: workspace.id },
        url: 'https://affine.pro/invite/test',
      },
    },
    { actorUserId: owner.id, workspaceId: workspace.id }
  );

  await mailJob.processReadyDeliveries();

  const updated = await delivery(row.id);
  t.is(updated.status, 'retry_wait');
  t.is(updated.attemptCount, 1);
  t.like(updated.payload as object, {
    props: {
      user: { $$userId: owner.id },
      workspace: { $$workspaceId: workspace.id },
    },
  });
});

test('should skip member invitation mail when rendered workspace name contains domain', async t => {
  const owner = await module.create(Mockers.User);
  const member = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: owner.id },
    name: 'BTC example.com',
  });
  const send = Sinon.stub(sender, 'send').resolves({
    status: 'accepted',
    retryable: false,
  });
  const row = await createDelivery(
    {
      name: 'MemberInvitation',
      to: member.email,
      props: {
        user: { $$userId: owner.id },
        workspace: { $$workspaceId: workspace.id },
        url: 'https://affine.pro/invite/test',
      },
    },
    { actorUserId: owner.id, workspaceId: workspace.id }
  );

  await mailJob.processReadyDeliveries();

  const updated = await delivery(row.id);
  t.false(send.called);
  t.is(updated.status, 'skipped');
  t.is(updated.lastErrorCode, 'dynamic_props_missing');
});

test('should mark accepted mail as sent and anonymize sendable payload', async t => {
  const user = await module.create(Mockers.User);
  Sinon.stub(sender, 'send').resolves({
    status: 'accepted',
    retryable: false,
    providerMessageId: 'message-id',
    providerResponse: '250 ok',
  });
  const row = await createDelivery({
    name: 'SignIn',
    to: user.email,
    props: { url: 'https://affine.pro/sign-in', otp: '123456' },
  });

  await mailJob.processReadyDeliveries();

  const updated = await delivery(row.id);
  t.is(updated.status, 'sent');
  t.is(updated.providerMessageId, 'message-id');
  t.is(updated.recipientEmail, null);
  t.is(updated.payload, null);
  t.is(updated.retentionState, 'anonymized');
});

test('should claim critical priority before lower priority rows', async t => {
  Sinon.stub(sender, 'send').resolves({
    status: 'accepted',
    retryable: false,
  });
  const low = await createDelivery(
    {
      name: 'SignIn',
      to: 'low-priority@example.com',
      props: { url: 'https://affine.pro/sign-in', otp: '123456' },
    },
    { priority: 'low' }
  );
  const critical = await createDelivery({
    name: 'SignIn',
    to: 'critical-priority@example.com',
    props: { url: 'https://affine.pro/sign-in', otp: '123456' },
  });

  await mailJob.processReadyDeliveries(1);

  t.is((await delivery(critical.id)).status, 'sent');
  t.is((await delivery(low.id)).status, 'queued');
});

test('should reclaim expired sending lease', async t => {
  Sinon.stub(sender, 'send').resolves({
    status: 'accepted',
    retryable: false,
  });
  const row = await createDelivery({
    name: 'SignIn',
    to: 'reclaim@example.com',
    props: { url: 'https://affine.pro/sign-in', otp: '123456' },
  });
  await db.mailDelivery.update({
    where: { id: row.id },
    data: {
      status: 'sending',
      lockedBy: 'dead-worker',
      lockedUntil: new Date(Date.now() - 1000),
    },
  });

  await mailJob.processReadyDeliveries();

  t.is((await delivery(row.id)).status, 'sent');
});

test('should delete retained anonymized terminal rows on worker tick', async t => {
  const row = await createDelivery(
    {
      name: 'SignIn',
      to: 'retention@example.com',
      props: { url: 'https://affine.pro/sign-in', otp: '123456' },
    },
    { status: 'skipped' }
  );
  await db.mailDelivery.update({
    where: { id: row.id },
    data: {
      settledAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    },
  });

  await mailJob.sendPendingMails();

  t.is(await db.mailDelivery.count({ where: { id: row.id } }), 0);
});
