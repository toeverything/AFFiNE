import ava, { TestFn } from 'ava';
import sinon from 'sinon';

import { type EventBus } from '../../base';
import { AuthSessionService, AuthSigningKeyRing } from '../../core/auth';
import { BackendRuntimeProvider } from '../../core/backend-runtime';

const test = ava as TestFn<{
  runtime: sinon.SinonStubbedInstance<BackendRuntimeProvider>;
  event: sinon.SinonStubbedInstance<EventBus>;
  sessions: AuthSessionService;
  keys: AuthSigningKeyRing;
}>;

test.beforeEach(t => {
  const runtime = {
    executeAuthSessionCommandV1: sinon.stub(),
  } as unknown as sinon.SinonStubbedInstance<BackendRuntimeProvider>;
  const event = {
    emit: sinon.stub(),
  } as unknown as sinon.SinonStubbedInstance<EventBus>;
  t.context = {
    runtime,
    event,
    sessions: new AuthSessionService(runtime, event),
    keys: new AuthSigningKeyRing(runtime, event),
  };
});

test('auth session adapter maps protocol dates and refresh events', async t => {
  t.context.runtime.executeAuthSessionCommandV1.onFirstCall().resolves({
    status: 'rotated',
    userId: 'user-1',
    tokenType: 'Bearer',
    accessToken: 'access',
    expiresIn: 300,
    refreshToken: 'refresh',
    refreshExpiresAt: '2026-09-08T00:00:00.000Z',
    session: {
      id: 'session-1',
      absoluteExpiresAt: '2026-10-01T00:00:00.000Z',
    },
    authSessionId: 'session-1',
    platform: 'ios',
    grace: false,
  });
  const refreshed = await t.context.sessions.refresh('source-token', '1.0.1');
  t.is(refreshed.status, 'rotated');
  if (refreshed.status !== 'rotated') return;
  t.true(refreshed.refreshExpiresAt instanceof Date);
  t.true(refreshed.session.absoluteExpiresAt instanceof Date);
  t.true(
    t.context.runtime.executeAuthSessionCommandV1.calledWithExactly({
      action: 'refresh',
      refreshToken: 'source-token',
      appVersion: '1.0.1',
    })
  );
  t.true(
    t.context.event.emit.calledWithExactly('auth.session.refreshed', {
      authSessionId: 'session-1',
    })
  );

  t.context.runtime.executeAuthSessionCommandV1.reset();
  t.context.runtime.executeAuthSessionCommandV1.resolves([
    {
      id: 'session-1',
      installationId: 'installation-1',
      platform: 'ios',
      createdAt: '2026-09-07T00:00:00.000Z',
      lastSeenAt: '2026-09-07T01:00:00.000Z',
      idleExpiresAt: '2026-09-08T00:00:00.000Z',
      absoluteExpiresAt: '2026-10-01T00:00:00.000Z',
    },
  ]);
  const [listed] = await t.context.sessions.list('user-1');
  t.true(listed.createdAt instanceof Date);
  t.true(listed.lastSeenAt instanceof Date);
  t.true(listed.idleExpiresAt instanceof Date);
  t.true(listed.absoluteExpiresAt instanceof Date);
});

test('signing key adapter maps metadata and emits rotation', async t => {
  t.context.runtime.executeAuthSessionCommandV1.onFirstCall().resolves([
    {
      id: 'old-key',
      status: 'active',
      source: 'auto',
      createdAt: '2026-09-01T00:00:00.000Z',
      canDelete: false,
    },
  ]);
  t.context.runtime.executeAuthSessionCommandV1.onSecondCall().resolves([
    {
      id: 'old-key',
      status: 'retiring',
      source: 'auto',
      verifyUntil: '2026-09-08T00:00:00.000Z',
      canDelete: false,
    },
    {
      id: 'new-key',
      status: 'active',
      source: 'admin',
      canDelete: false,
    },
  ]);

  const keys = await t.context.keys.rotate('actor-1', 'old-key');
  t.true(keys[0].verifyUntil instanceof Date);
  t.true(
    t.context.runtime.executeAuthSessionCommandV1.secondCall.calledWithExactly({
      action: 'rotate_signing_key',
      actorId: 'actor-1',
      expectedActiveKeyId: 'old-key',
    })
  );
  t.true(
    t.context.event.emit.calledWithExactly('auth.signing_key.rotated', {
      actorId: 'actor-1',
      previousKeyId: 'old-key',
      activeKeyId: 'new-key',
    })
  );
});
