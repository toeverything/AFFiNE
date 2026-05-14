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

test('native entitlement wrapper validates JS quantity before native coercion', t => {
  const base = {
    deploymentType: 'cloud',
    targetType: 'workspace',
    plan: 'team',
    now: '2026-05-14T00:00:00Z',
  };
  const cases = [
    { quantity: 4294967297, valid: false },
    { quantity: 1.5, valid: false },
    { quantity: 100001, valid: false },
    { quantity: 100000, valid: true },
  ];

  for (const { quantity, valid } of cases) {
    if (valid) {
      const resolved = resolveEntitlementV1({ ...base, quantity });
      t.is(resolved.quantity, quantity);
      t.is(resolved.quota.seatLimit, quantity);
    } else {
      const error = t.throws(() => resolveEntitlementV1({ ...base, quantity }));
      t.is(
        (error as Error & { code?: string })?.code,
        'InvalidArg',
        String(quantity)
      );
    }
  }
});
