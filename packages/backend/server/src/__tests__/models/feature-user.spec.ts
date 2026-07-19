import { User } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { AdminFeatureManagementResolver } from '../../core/features/resolver';
import { AvailableUserFeatureConfig } from '../../core/features/types';
import {
  Feature,
  FeatureType,
  UserFeatureModel,
  UserModel,
} from '../../models';
import { createTestingModule, TestingModule } from '../utils';

interface Context {
  module: TestingModule;
  model: UserFeatureModel;
  resolver: AdminFeatureManagementResolver;
  u1: User;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule({});
  t.context.model = module.get(UserFeatureModel);
  t.context.resolver = module.get(AdminFeatureManagementResolver);
  t.context.module = module;
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
  t.context.u1 = await t.context.module.get(UserModel).create({
    email: 'u1@affine.pro',
    registered: true,
  });
});

test.after(async t => {
  await t.context.module.close();
});

test('only administrator is a configurable user feature', t => {
  const config = new AvailableUserFeatureConfig();
  t.deepEqual([...config.availableUserFeatures()], [Feature.Admin]);
  t.deepEqual([...config.configurableUserFeatures()], [Feature.Admin]);
});

test('should get null if user feature not found', async t => {
  t.is(await t.context.model.get(t.context.u1.id, Feature.Admin), null);
});

test('should add and get user feature', async t => {
  const { model, u1 } = t.context;
  await model.add(u1.id, Feature.Admin, 'test');
  t.is((await model.get(u1.id, Feature.Admin))?.name, Feature.Admin);
  t.true(await model.has(u1.id, Feature.Admin));
  t.deepEqual(await model.list(u1.id, FeatureType.Feature), [Feature.Admin]);
});

test('should not add existing user feature', async t => {
  const { model, u1 } = t.context;
  await model.add(u1.id, Feature.Admin, 'test');
  await model.add(u1.id, Feature.Admin, 'test');
  t.deepEqual(await model.list(u1.id), [Feature.Admin]);
});

test('should remove user feature', async t => {
  const { model, u1 } = t.context;
  await model.add(u1.id, Feature.Admin, 'test');
  await model.remove(u1.id, Feature.Admin);
  t.false(await model.has(u1.id, Feature.Admin));
});

test('admin resolver updates administrator feature', async t => {
  await t.context.resolver.updateUserFeatures(t.context.u1.id, [Feature.Admin]);
  t.true(await t.context.model.has(t.context.u1.id, Feature.Admin));
});
