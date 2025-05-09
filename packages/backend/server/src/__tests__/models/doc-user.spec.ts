import { PrismaClient } from '@prisma/client';
import test from 'ava';
import Sinon from 'sinon';

import { EventBus } from '../../base';
import { DocRole, Models } from '../../models';
import { createTestingModule, TestingModule } from '../utils';

let db: PrismaClient;
let models: Models;
let module: TestingModule;

test.before(async () => {
  module = await createTestingModule({
    tapModule: m => {
      m.overrideProvider(EventBus).useValue(Sinon.createStubInstance(EventBus));
    },
  });
  models = module.get(Models);
  db = module.get(PrismaClient);
});

test.beforeEach(async () => {
  await module.initTestingDB();
  Sinon.reset();
});

test.after(async () => {
  await module.close();
});

async function create() {
  return db.workspace.create({
    data: { public: false },
  });
}

test('should set doc owner', async t => {
  const workspace = await create();
  const user = await models.user.create({ email: 'u1@affine.pro' });
  const docId = 'fake-doc-id';

  await models.docUser.setOwner(workspace.id, docId, user.id);
  const role = await models.docUser.get(workspace.id, docId, user.id);

  t.is(role?.type, DocRole.Owner);
});

test('should transfer doc owner', async t => {
  const user = await models.user.create({ email: 'u1@affine.pro' });
  const user2 = await models.user.create({ email: 'u2@affine.pro' });
  const workspace = await create();
  const docId = 'fake-doc-id';

  await models.docUser.setOwner(workspace.id, docId, user.id);
  await models.docUser.setOwner(workspace.id, docId, user2.id);

  const oldOwnerRole = await models.docUser.get(workspace.id, docId, user.id);
  const newOwnerRole = await models.docUser.get(workspace.id, docId, user2.id);

  t.is(oldOwnerRole?.type, DocRole.Manager);
  t.is(newOwnerRole?.type, DocRole.Owner);
});

test('should set doc user role', async t => {
  const workspace = await create();
  const user = await models.user.create({ email: 'u1@affine.pro' });
  const docId = 'fake-doc-id';

  await models.docUser.set(workspace.id, docId, user.id, DocRole.Manager);
  const role = await models.docUser.get(workspace.id, docId, user.id);

  t.is(role?.type, DocRole.Manager);
});

test('should not allow setting doc owner through setDocUserRole', async t => {
  const workspace = await create();
  const user = await models.user.create({ email: 'u1@affine.pro' });
  const docId = 'fake-doc-id';

  await t.throwsAsync(
    models.docUser.set(workspace.id, docId, user.id, DocRole.Owner),
    { message: 'Cannot set Owner role of a doc to a user.' }
  );
});

test('should delete doc user role', async t => {
  const workspace = await create();
  const user = await models.user.create({ email: 'u1@affine.pro' });
  const docId = 'fake-doc-id';

  await models.docUser.set(workspace.id, docId, user.id, DocRole.Manager);
  await models.docUser.delete(workspace.id, docId, user.id);

  const role = await models.docUser.get(workspace.id, docId, user.id);
  t.is(role, null);
});

test('should paginate doc user roles', async t => {
  const workspace = await create();
  const docId = 'fake-doc-id';
  await db.user.createMany({
    data: Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      name: `u${i}`,
      email: `${i}@affine.pro`,
    })),
  });

  await db.workspaceDocUserRole.createMany({
    data: Array.from({ length: 200 }, (_, i) => ({
      workspaceId: workspace.id,
      docId,
      userId: String(i),
      type: DocRole.Editor,
      createdAt: new Date(Date.now() + i * 1000),
    })),
  });

  const [roles, total] = await models.docUser.paginate(workspace.id, docId, {
    first: 10,
    offset: 0,
  });

  t.is(roles.length, 10);
  t.is(total, 200);

  const [roles2] = await models.docUser.paginate(workspace.id, docId, {
    after: roles.at(-1)?.createdAt.toISOString(),
    first: 50,
    offset: 0,
  });

  t.is(roles2.length, 50);
  t.not(roles2[0].type, DocRole.Owner);
  t.deepEqual(
    roles2.map(r => r.userId),
    roles2
      .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(r => r.userId)
  );
});

test('should count doc user roles', async t => {
  const workspace = await create();
  const docId = 'fake-doc-id';
  const users = await Promise.all([
    models.user.create({ email: 'u1@affine.pro' }),
    models.user.create({ email: 'u2@affine.pro' }),
  ]);

  await Promise.all(
    users.map(user =>
      models.docUser.set(workspace.id, docId, user.id, DocRole.Manager)
    )
  );

  const count = await models.docUser.count(workspace.id, docId);
  t.is(count, 2);
});
