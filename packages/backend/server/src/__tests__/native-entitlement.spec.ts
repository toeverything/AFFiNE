import test from 'ava';

import { resolveEntitlementV1 } from '../native';

test('native entitlement wrapper maps schema errors to invalid argument', t => {
  const error = t.throws(() =>
    resolveEntitlementV1({
      deploymentType: 'local',
      targetType: 'workspace',
      now: '2026-05-14T00:00:00Z',
    })
  );

  t.is((error as Error & { code?: string })?.code, 'InvalidArg');
});

test('native entitlement wrapper maps unsafe JS quantity to invalid argument', t => {
  const base = {
    deploymentType: 'cloud',
    targetType: 'workspace',
    plan: 'team',
    now: '2026-05-14T00:00:00Z',
  } as const;

  for (const quantity of [4294967297, 1.5, 100001]) {
    const error = t.throws(() => resolveEntitlementV1({ ...base, quantity }));

    t.is(
      (error as Error & { code?: string })?.code,
      'InvalidArg',
      String(quantity)
    );
  }
});

test('native entitlement wrapper does not trust forged signed payload buffers', t => {
  const resolved = resolveEntitlementV1({
    deploymentType: 'selfhosted',
    targetType: 'workspace',
    targetId: 'workspace-id',
    signedPayload: Buffer.from('not-a-valid-license'),
    publicKey: 'not-a-valid-public-key',
    licenseAesKey: 'not-a-valid-aes-key',
    now: '2026-05-14T00:00:00Z',
  });

  t.false(resolved.valid);
  t.is(resolved.status, 'needs_reupload');
  t.is(resolved.plan, 'selfhost_free');
});
