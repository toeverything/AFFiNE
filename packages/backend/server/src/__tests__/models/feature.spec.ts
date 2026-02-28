import ava, { TestFn } from 'ava';

import { FeatureType } from '../../models';
import { FeatureModel } from '../../models/feature';
import { createTestingModule, type TestingModule } from '../utils';

interface Context {
  module: TestingModule;
  feature: FeatureModel;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule({});

  t.context.feature = module.get(FeatureModel);
  t.context.module = module;
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after(async t => {
  await t.context.module.close();
});

test('should get feature', async t => {
  const { feature } = t.context;
  const freePlanFeature = await feature.get('free_plan_v1');

  t.snapshot(freePlanFeature.configs);
});

test('should throw if feature not found', async t => {
  const { feature } = t.context;
  await t.throwsAsync(feature.get('not_found_feature' as any), {
    message: 'Feature not_found_feature not found',
  });
});

test('should throw if feature config in invalid', async t => {
  const { feature } = t.context;
  const freePlanFeature = await feature.get('free_plan_v1');

  // @ts-expect-error internal
  await feature.db.feature.update({
    where: {
      id: freePlanFeature.id,
    },
    data: {
      configs: {
        ...freePlanFeature.configs,
        memberLimit: 'invalid' as any,
      },
    },
  });

  await t.throwsAsync(feature.get('free_plan_v1'), {
    message: 'Invalid feature config for free_plan_v1',
  });
});

// NOTE(@forehalo): backward compatibility
//   new version of feature config may introduce new field
//   this test means to ensure that the older version of AFFiNE Server can still read it
test('should get feature if extra fields exist in feature config', async t => {
  const { feature } = t.context;
  const freePlanFeature = await feature.get('free_plan_v1');

  // @ts-expect-error internal
  await feature.db.feature.update({
    where: {
      id: freePlanFeature.id,
    },
    data: {
      configs: {
        ...freePlanFeature.configs,
        extraField: 'extraValue',
      },
    },
  });

  const freePlanFeature2 = await feature.get('free_plan_v1');

  t.snapshot(freePlanFeature2.configs);
});

test('should create feature', async t => {
  const { feature } = t.context;

  // @ts-expect-error internal
  const newFeature = await feature.upsert(
    'new_feature' as any,
    {},
    FeatureType.Feature,
    1
  );

  t.deepEqual(newFeature.configs, {});
});

test('should update feature', async t => {
  const { feature } = t.context;
  const freePlanFeature = await feature.get('free_plan_v1');

  // @ts-expect-error internal
  const newFreePlanFeature = await feature.upsert(
    'free_plan_v1',
    {
      ...freePlanFeature.configs,
      memberLimit: 10,
    },
    FeatureType.Quota,
    1
  );

  t.deepEqual(newFreePlanFeature.configs, {
    ...freePlanFeature.configs,
    memberLimit: 10,
  });
});

test('should throw if feature config is invalid when updating', async t => {
  const { feature } = t.context;
  await t.throwsAsync(
    // @ts-expect-error internal
    feature.upsert('free_plan_v1', {} as any, FeatureType.Quota, 1),
    {
      message: 'Invalid feature config for free_plan_v1',
    }
  );
});
