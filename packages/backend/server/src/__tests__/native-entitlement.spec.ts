import test from 'ava';

import { BackendRuntime, resolveEntitlementV1 } from '../native';

test('native entitlement boundary maps invalid input to InvalidArg', async t => {
  const runtime = new BackendRuntime(
    'test-private-key',
    [],
    undefined,
    undefined
  );
  t.teardown(() => runtime.stop());
  const schemaError = t.throws(() =>
    resolveEntitlementV1({
      deploymentType: 'local',
      targetType: 'workspace',
      now: '2026-05-14T00:00:00Z',
    })
  );
  t.is((schemaError as Error & { code?: string }).code, 'InvalidArg');

  const base = {
    deploymentType: 'cloud',
    targetType: 'workspace',
    plan: 'team',
    now: '2026-05-14T00:00:00Z',
  } as const;
  for (const quantity of [4_294_967_297, 1.5]) {
    const error = t.throws(() => resolveEntitlementV1({ ...base, quantity }));
    t.is(
      (error as Error & { code?: string }).code,
      'InvalidArg',
      String(quantity)
    );
    const mutationError = await t.throwsAsync(
      runtime.upsertAdminGrantV1({
        targetType: 'workspace',
        targetId: 'unused',
        plan: 'team',
        quantity,
      })
    );
    t.is(
      (mutationError as Error & { code?: string }).code,
      'InvalidArg',
      String(quantity)
    );
  }
});
