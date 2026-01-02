import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { Config } from '../../base';
import { UserModel } from '../../models/user';
import { WorkspaceModel } from '../../models/workspace';
import { createTestingModule, type TestingModule } from '../utils';

interface Context {
  config: Config;
  module: TestingModule;
  db: PrismaClient;
  user: UserModel;
  workspace: WorkspaceModel;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule();
  t.context.user = module.get(UserModel);
  t.context.workspace = module.get(WorkspaceModel);
  t.context.db = module.get(PrismaClient);
  t.context.config = module.get(Config);
  t.context.module = module;
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after(async t => {
  await t.context.module.close();
});

test('should create a new workspace, default to private', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  const workspace = await t.context.workspace.create(user.id);
  t.truthy(workspace.id);
  t.truthy(workspace.createdAt);
  t.is(workspace.public, false);

  const workspace1 = await t.context.workspace.get(workspace.id);
  t.deepEqual(workspace, workspace1);
});

test('should get null for non-exist workspace', async t => {
  const workspace = await t.context.workspace.get('non-exist');
  t.is(workspace, null);
});

test('should update workspace', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  const workspace = await t.context.workspace.create(user.id);
  const data = {
    public: true,
    enableAi: true,
    enableSharing: false,
    enableUrlPreview: true,
    enableDocEmbedding: false,
  };
  await t.context.workspace.update(workspace.id, data);
  const workspace1 = await t.context.workspace.get(workspace.id);
  t.deepEqual(workspace1, {
    ...workspace,
    ...data,
  });
});

test('should delete workspace', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  const workspace = await t.context.workspace.create(user.id);
  await t.context.workspace.delete(workspace.id);
  const workspace1 = await t.context.workspace.get(workspace.id);
  t.is(workspace1, null);
  // delete again should not throw
  await t.context.workspace.delete(workspace.id);
});
