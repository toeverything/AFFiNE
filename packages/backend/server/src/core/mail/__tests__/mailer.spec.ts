import { createHash, createHmac } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import {
  createTestingModule,
  type TestingModule,
} from '../../../__tests__/utils';
import { CryptoHelper } from '../../../base';
import { Models } from '../../../models';
import { BackendRuntimeProvider } from '../../backend-runtime';
import { Mailer } from '../mailer';
import { MailSender } from '../sender';

interface Context {
  module: TestingModule;
  mailer: Mailer;
  models: Models;
  db: PrismaClient;
  crypto: CryptoHelper;
  runtime: {
    assertMailDeliveryQuotaV1: Sinon.SinonStub;
    commitMailDeliveryQuotaV1: Sinon.SinonStub;
    releaseMailDeliveryQuotaV1: Sinon.SinonStub;
  };
}

const test = ava as TestFn<Context>;

test.before(async t => {
  t.context.runtime = {
    assertMailDeliveryQuotaV1: Sinon.stub(),
    commitMailDeliveryQuotaV1: Sinon.stub(),
    releaseMailDeliveryQuotaV1: Sinon.stub(),
  };
  t.context.module = await createTestingModule({
    tapModule: builder => {
      builder
        .overrideProvider(Mailer)
        .useClass(Mailer)
        .overrideProvider(MailSender)
        .useValue({ configured: true })
        .overrideProvider(BackendRuntimeProvider)
        .useValue(t.context.runtime);
    },
  });
  t.context.mailer = t.context.module.get(Mailer);
  t.context.models = t.context.module.get(Models);
  t.context.db = t.context.module.get(PrismaClient);
  t.context.crypto = t.context.module.get(CryptoHelper);
});

test.beforeEach(t => {
  t.context.runtime.assertMailDeliveryQuotaV1.reset();
  t.context.runtime.commitMailDeliveryQuotaV1.reset();
  t.context.runtime.releaseMailDeliveryQuotaV1.reset();
  t.context.runtime.assertMailDeliveryQuotaV1.resolves({
    allowed: true,
    reservationId: '00000000-0000-0000-0000-000000000001',
    mailClass: 'auth',
  });
  t.context.runtime.commitMailDeliveryQuotaV1.resolves(true);
  t.context.runtime.releaseMailDeliveryQuotaV1.resolves(true);
});

test.afterEach.always(async t => {
  Sinon.restore();
  await t.context.db.mailDelivery.deleteMany();
});

test.after.always(async t => {
  await t.context.module.close();
});

test('trySend creates a delivery row and commits quota reservation', async t => {
  const sent = await t.context.mailer.trySend({
    name: 'SignIn',
    to: 'auth-user@example.com',
    props: {
      url: 'https://affine.pro/sign-in',
      otp: '123456',
    },
    metadata: {
      dedupeKey: 'signin:auth-user@example.com:1',
      recipientUserId: 'user-1',
      source: { trusted: false },
    },
  });

  const row = await t.context.db.mailDelivery.findFirstOrThrow({
    where: { dedupeKey: 'signin:auth-user@example.com:1' },
  });

  t.true(sent);
  t.is(row.status, 'queued');
  t.is(row.recipientUserId, 'user-1');
  t.is(row.mailClass, 'auth');
  t.is(
    row.recipientHash,
    createHmac('sha256', t.context.crypto.keyPair.sha256.privateKey)
      .update('auth-user@example.com')
      .digest('hex')
  );
  t.not(
    row.recipientHash,
    createHash('sha256').update('auth-user@example.com').digest('hex')
  );
  t.true(
    t.context.runtime.commitMailDeliveryQuotaV1.calledOnceWithExactly(
      '00000000-0000-0000-0000-000000000001'
    )
  );
});

test('cancelByRecipient matches the keyed recipient hash', async t => {
  await t.context.mailer.trySend({
    name: 'SignIn',
    to: '  Delete-Me@Example.COM  ',
    props: {
      url: 'https://affine.pro/sign-in',
      otp: '123456',
    },
    metadata: {
      dedupeKey: 'signin:delete-me@example.com:1',
      source: { trusted: false },
    },
  });

  await t.context.models.mailDelivery.cancelByRecipient(
    'delete-me@example.com'
  );

  const row = await t.context.db.mailDelivery.findFirstOrThrow({
    where: { dedupeKey: 'signin:delete-me@example.com:1' },
  });
  t.is(
    row.recipientHash,
    createHmac('sha256', t.context.crypto.keyPair.sha256.privateKey)
      .update('delete-me@example.com')
      .digest('hex')
  );
  t.is(row.status, 'canceled');
  t.is(row.lastErrorCode, 'recipient_deleted');
});

test('dedupe replay does not consume another mail quota reservation', async t => {
  const command = {
    name: 'SignIn' as const,
    to: 'dedupe@example.com',
    props: {
      url: 'https://affine.pro/sign-in',
      otp: '123456',
    },
    metadata: {
      dedupeKey: 'signin:dedupe@example.com:1',
      source: { trusted: false },
    },
  };

  t.true(await t.context.mailer.trySend(command));
  t.true(await t.context.mailer.trySend(command));

  t.is(t.context.runtime.assertMailDeliveryQuotaV1.callCount, 1);
  t.is(t.context.runtime.commitMailDeliveryQuotaV1.callCount, 1);
  t.is(
    await t.context.db.mailDelivery.count({
      where: { dedupeKey: command.metadata.dedupeKey },
    }),
    1
  );
});

test('quota denial records skipped deliveries without committing quota', async t => {
  for (const quota of [
    {
      email: 'limited@example.com',
      mailClass: 'auth',
      reason: 'recipient_rate_limited',
    },
    {
      email: 'unmapped@example.com',
      mailClass: 'unknown',
      reason: 'unmapped_mail_name',
    },
  ] as const) {
    t.context.runtime.assertMailDeliveryQuotaV1.resolves({
      allowed: false,
      mailClass: quota.mailClass,
      reason: quota.reason,
    });

    const dedupeKey = `signin:${quota.email}:1`;
    const sent = await t.context.mailer.trySend({
      name: 'SignIn',
      to: quota.email,
      props: {
        url: 'https://affine.pro/sign-in',
        otp: '123456',
      },
      metadata: {
        dedupeKey,
        source: { trusted: false },
      },
    });

    const row = await t.context.db.mailDelivery.findFirstOrThrow({
      where: { dedupeKey },
    });

    t.false(sent, quota.reason);
    t.is(row.status, 'skipped', quota.reason);
    t.is(row.mailClass, quota.mailClass, quota.reason);
    t.is(row.lastErrorCode, quota.reason, quota.reason);
    t.is(row.recipientEmail, null, quota.reason);
    t.false(t.context.runtime.commitMailDeliveryQuotaV1.called, quota.reason);
    t.context.runtime.assertMailDeliveryQuotaV1.resetHistory();
  }
});

test('skip records terminal delivery without quota admission', async t => {
  const sent = await t.context.mailer.skip(
    {
      name: 'MemberInvitation',
      to: 'skip@example.com',
      props: {
        url: 'https://affine.pro/invite',
        user: { $$userId: 'actor-1' },
        workspace: { $$workspaceId: 'workspace-1' },
      },
      metadata: {
        dedupeKey: 'invite:skip@example.com:1',
        recipientUserId: 'user-1',
        actorUserId: 'actor-1',
        workspaceId: 'workspace-1',
        source: { trusted: false },
      },
    },
    {
      mailClass: 'workspace_invitation',
      reason: 'workspace_name_contains_domain',
    }
  );

  const row = await t.context.db.mailDelivery.findFirstOrThrow({
    where: { dedupeKey: 'invite:skip@example.com:1' },
  });

  t.false(sent);
  t.is(row.status, 'skipped');
  t.is(row.mailClass, 'workspace_invitation');
  t.is(row.lastErrorCode, 'workspace_name_contains_domain');
  t.is(row.maxAttempts, 0);
  t.false(t.context.runtime.assertMailDeliveryQuotaV1.called);
});

test('send releases quota reservation and rethrows when ledger write fails', async t => {
  Sinon.stub(t.context.models.mailDelivery, 'create').rejects(
    new Error('ledger failed')
  );

  await t.throwsAsync(
    t.context.mailer.send({
      name: 'SignIn',
      to: 'throw@example.com',
      props: {
        url: 'https://affine.pro/sign-in',
        otp: '123456',
      },
      metadata: {
        source: { trusted: false },
      },
    }),
    { message: 'ledger failed' }
  );

  t.true(
    t.context.runtime.releaseMailDeliveryQuotaV1.calledOnceWithExactly(
      '00000000-0000-0000-0000-000000000001'
    )
  );
});

test('send cancels queued delivery when quota commit fails', async t => {
  t.context.runtime.commitMailDeliveryQuotaV1.rejects(
    new Error('commit failed')
  );

  await t.throwsAsync(
    t.context.mailer.send({
      name: 'SignIn',
      to: 'commit-failed@example.com',
      props: {
        url: 'https://affine.pro/sign-in',
        otp: '123456',
      },
      metadata: {
        dedupeKey: 'signin:commit-failed@example.com:1',
        source: { trusted: false },
      },
    }),
    { message: 'commit failed' }
  );

  const row = await t.context.db.mailDelivery.findFirstOrThrow({
    where: { dedupeKey: 'signin:commit-failed@example.com:1' },
  });
  t.is(row.status, 'canceled');
  t.is(row.lastErrorCode, 'quota_commit_failed');
  t.true(
    t.context.runtime.releaseMailDeliveryQuotaV1.calledOnceWithExactly(
      '00000000-0000-0000-0000-000000000001'
    )
  );
});
