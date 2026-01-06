import ava, { TestFn } from 'ava';

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
