import { User } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { FeatureType, Models, UserFeatureModel, UserModel } from '../../models';
import { createTestingModule, TestingModule } from '../utils';

interface Context {
  module: TestingModule;
  model: UserFeatureModel;
  u1: User;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule({});

  t.context.model = module.get(UserFeatureModel);
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

test('should get null if user feature not found', async t => {
  const { model, u1 } = t.context;
  const userFeature = await model.get(u1.id, 'ai_early_access');
  t.is(userFeature, null);
});

test('should get user feature', async t => {
  const { model, u1 } = t.context;
  const userFeature = await model.get(u1.id, 'free_plan_v1');
  t.is(userFeature?.name, 'free_plan_v1');
});

test('should get user quota', async t => {
  const { model, u1 } = t.context;
  const userQuota = await model.getQuota(u1.id);
  t.snapshot(userQuota?.configs, 'free plan');
});

test('should list user features', async t => {
  const { model, u1 } = t.context;

  t.like(await model.list(u1.id), ['free_plan_v1']);
});

test('should list user features by type', async t => {
  const { model, u1 } = t.context;

  await model.add(u1.id, 'free_plan_v1', 'test');
  await model.add(u1.id, 'unlimited_copilot', 'test');

  t.like(await model.list(u1.id, FeatureType.Quota), ['free_plan_v1']);
  t.like(await model.list(u1.id, FeatureType.Feature), ['unlimited_copilot']);
});

test('should directly test user feature existence', async t => {
  const { model, u1 } = t.context;

  t.true(await model.has(u1.id, 'free_plan_v1'));
  t.false(await model.has(u1.id, 'ai_early_access'));
});

test('should add user feature', async t => {
  const { model, u1 } = t.context;

  await model.add(u1.id, 'unlimited_copilot', 'test');
  t.true(await model.has(u1.id, 'unlimited_copilot'));
  t.true((await model.list(u1.id)).includes('unlimited_copilot'));
});

test('should not add existing user feature', async t => {
  const { model, u1 } = t.context;

  await model.add(u1.id, 'free_plan_v1', 'test');
  await model.add(u1.id, 'free_plan_v1', 'test');

  t.like(await model.list(u1.id), ['free_plan_v1']);
});

test('should remove user feature', async t => {
  const { model, u1 } = t.context;

  await model.remove(u1.id, 'free_plan_v1');
  t.false(await model.has(u1.id, 'free_plan_v1'));
  t.false((await model.list(u1.id)).includes('free_plan_v1'));
});

test('should switch user quota', async t => {
  const { model, u1 } = t.context;

  await model.switchQuota(u1.id, 'pro_plan_v1', 'test');
  const quota = await model.getQuota(u1.id);
  t.snapshot(quota?.configs, 'switch to pro plan');

  await model.switchQuota(u1.id, 'free_plan_v1', 'test');
  const quota2 = await model.getQuota(u1.id);
  t.snapshot(quota2?.configs, 'switch to free plan');
});

test('should not switch user quota if the new quota is the same as the current one', async t => {
  const { model, u1 } = t.context;

  await model.switchQuota(u1.id, 'free_plan_v1', 'test not switch');

  // @ts-expect-error private
  const quota = await model.db.userFeature.findFirst({
    where: {
      userId: u1.id,
    },
  });

  t.not(quota?.reason, 'test not switch');
});

test('should use pro plan as free for selfhost instance', async t => {
  // @ts-expect-error DEPLOYMENT_TYPE is readonly
  env.DEPLOYMENT_TYPE = 'selfhosted';
  await using module = await createTestingModule();

  const models = module.get(Models);
  const u1 = await models.user.create({
    email: 'u1@affine.pro',
    registered: true,
  });

  const quota = await models.userFeature.getQuota(u1.id);
  t.snapshot(
    quota?.configs,
    'use pro plan as free plan for selfhosted instance'
  );
});
