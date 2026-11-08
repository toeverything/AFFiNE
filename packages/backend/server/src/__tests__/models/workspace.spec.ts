import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { Config, EventBus } from '../../base';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { WorkspaceStatsJob } from '../../core/workspaces/stats.job';
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

const test = ava.serial as TestFn<Context>;

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

  const stats = new WorkspaceStatsJob(t.context.db);
  await t.context.db.$executeRawUnsafe(`
    CREATE FUNCTION test_workspace_stats_failure() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'injected workspace stats failure';
    END;
    $$ LANGUAGE plpgsql
  `);
  await t.context.db.$executeRawUnsafe(`
    CREATE TRIGGER test_workspace_stats_failure
    BEFORE INSERT OR UPDATE ON workspace_admin_stats
    FOR EACH ROW EXECUTE FUNCTION test_workspace_stats_failure()
  `);
  await stats.refreshDirty();
  t.is(
    await t.context.db.workspaceAdminStatsDirty.count({
      where: { workspaceId: workspace.id },
    }),
    1
  );
  await t.context.db.$executeRawUnsafe(
    'DROP TRIGGER test_workspace_stats_failure ON workspace_admin_stats'
  );
  await t.context.db.$executeRawUnsafe(
    'DROP FUNCTION test_workspace_stats_failure()'
  );
  await Promise.all([stats.refreshDirty(), stats.refreshDirty()]);
  t.is(
    await t.context.db.workspaceAdminStatsDirty.count({
      where: { workspaceId: workspace.id },
    }),
    0
  );
  const aggregated = await t.context.db.workspaceAdminStats.findUniqueOrThrow({
    where: { workspaceId: workspace.id },
  });
  t.is(aggregated.memberCount, 1n);
  await stats.recalibrate();
  await stats.recalibrate();
  t.is(
    await t.context.db.workspaceAdminStatsDaily.count({
      where: { workspaceId: workspace.id },
    }),
    1
  );

  const workspace1 = await t.context.workspace.get(workspace.id);
  t.deepEqual(workspace, workspace1);
});

test('should get null for non-exist workspace', async t => {
  const workspace = await t.context.workspace.get('non-exist');
  t.is(workspace, null);
});

test('should update workspace', async t => {
  t.timeout(10_000);
  const runtime = t.context.module.get(BackendRuntimeProvider);
  await runtime.onConfigChanged({ updates: { copilot: {} } });
  const event = t.context.module.get(EventBus);
  const notification = Promise.withResolvers<string>();
  const listener = (hint: Events['backendRuntime.invalidation']) => {
    if (hint.kind === 'quotaSeatUsage') notification.resolve(hint.workspaceId);
  };
  t.teardown(event.on('backendRuntime.invalidation', listener));
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  const workspace = await t.context.workspace.create(user.id);
  await runtime.quotaSeatUsageTransitionV1([workspace.id]);
  t.is(await notification.promise, workspace.id);
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
