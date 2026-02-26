import { randomUUID } from 'node:crypto';

import ava, { TestFn } from 'ava';

import {
  createTestingModule,
  type TestingModule,
} from '../../../__tests__/utils';
import { DocRole, Models, User, Workspace } from '../../../models';
import { EventsListener } from '../event';
import { PermissionModule } from '../index';

interface Context {
  module: TestingModule;
  models: Models;
  listener: EventsListener;
}

const test = ava as TestFn<Context>;

let owner: User;
let workspace: Workspace;

test.before(async t => {
  const module = await createTestingModule({ imports: [PermissionModule] });
  t.context.module = module;
  t.context.models = module.get(Models);
  t.context.listener = module.get(EventsListener);
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
  owner = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  workspace = await t.context.models.workspace.create(owner.id);
});

test.after.always(async t => {
  await t.context.module.close();
});

test('should ignore default owner event when workspace does not exist', async t => {
  await t.notThrowsAsync(async () => {
    await t.context.listener.setDefaultPageOwner({
      workspaceId: randomUUID(),
      docId: randomUUID(),
      editor: owner.id,
    });
  });
});

test('should ignore default owner event when editor does not exist', async t => {
  await t.notThrowsAsync(async () => {
    await t.context.listener.setDefaultPageOwner({
      workspaceId: workspace.id,
      docId: randomUUID(),
      editor: randomUUID(),
    });
  });
});

test('should set owner when workspace and editor exist', async t => {
  const docId = randomUUID();
  await t.context.listener.setDefaultPageOwner({
    workspaceId: workspace.id,
    docId,
    editor: owner.id,
  });

  const role = await t.context.models.docUser.get(
    workspace.id,
    docId,
    owner.id
  );
  t.is(role?.type, DocRole.Owner);
});
