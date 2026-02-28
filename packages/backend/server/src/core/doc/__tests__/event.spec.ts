import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

import ava, { TestFn } from 'ava';
import Sinon from 'sinon';
import { Doc as YDoc } from 'yjs';

import {
  createTestingModule,
  type TestingModule,
} from '../../../__tests__/utils';
import { Models, User, Workspace } from '../../../models';
import { DocReader, PgWorkspaceDocStorageAdapter as Adapter } from '..';
import { DocEventsListener } from '../event';

interface Context {
  module: TestingModule;
  docReader: DocReader;
  adapter: Adapter;
  models: Models;
  listener: DocEventsListener;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule();
  t.context.module = module;
  t.context.models = module.get(Models);
  t.context.docReader = module.get(DocReader);
  t.context.adapter = module.get(Adapter);
  t.context.listener = module.get(DocEventsListener);
});

let owner: User;
let workspace: Workspace;

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
  owner = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  workspace = await t.context.models.workspace.create(owner.id);
});

test.afterEach.always(() => {
  mock.reset();
  Sinon.restore();
});

test.after.always(async t => {
  await t.context.module.close();
});

test('should update doc content to database when doc is updated', async t => {
  const { docReader, models, adapter, listener } = t.context;
  const updates: Buffer[] = [];
  {
    const doc = new YDoc();
    doc.on('update', data => {
      updates.push(Buffer.from(data));
    });

    const text = doc.getText('content');
    text.insert(0, 'hello');
    text.insert(5, 'world');
  }

  const docId = randomUUID();
  await adapter.pushDocUpdates(workspace.id, docId, updates);
  await adapter.getDoc(workspace.id, docId);

  mock.method(docReader, 'parseDocContent', () => {
    return {
      title: 'test title',
      summary: 'test summary',
    };
  });

  const spy = Sinon.spy(models.doc, 'upsertMeta');
  await listener.markDocContentCacheStale({
    workspaceId: workspace.id,
    docId,
    blob: Buffer.from([]),
  });
  t.is(spy.callCount, 1);
  const content = await models.doc.getMeta(workspace.id, docId);
  t.truthy(content);
  t.is(content!.title, 'test title');
  t.is(content!.summary, 'test summary');
});

test('should ignore update doc content to database when snapshot parse failed', async t => {
  const { models, adapter, listener } = t.context;
  const updates: Buffer[] = [];
  {
    const doc = new YDoc();
    doc.on('update', data => {
      updates.push(Buffer.from(data));
    });

    const text = doc.getText('content');
    text.insert(0, 'hello');
    text.insert(5, 'world');
  }

  const docId = randomUUID();
  await adapter.pushDocUpdates(workspace.id, docId, updates);
  const doc = await adapter.getDoc(workspace.id, docId);

  const spy = Sinon.spy(models.doc, 'upsertMeta');
  await listener.markDocContentCacheStale({
    workspaceId: workspace.id,
    docId,
    blob: Buffer.from(doc!.bin),
  });
  t.is(spy.callCount, 0);
  const content = await models.doc.getMeta(workspace.id, docId);
  t.is(content, null);
});

test('should update workspace content to database when workspace is updated', async t => {
  const { docReader, models, adapter, listener } = t.context;
  const updates: Buffer[] = [];
  {
    const doc = new YDoc();
    doc.on('update', data => {
      updates.push(Buffer.from(data));
    });

    const text = doc.getText('content');
    text.insert(0, 'hello');
    text.insert(5, 'world');
  }
  await adapter.pushDocUpdates(workspace.id, workspace.id, updates);
  await adapter.getDoc(workspace.id, workspace.id);

  mock.method(docReader, 'parseWorkspaceContent', () => {
    return {
      name: 'test workspace name',
      avatarKey: 'test avatar key',
    };
  });

  await listener.markDocContentCacheStale({
    workspaceId: workspace.id,
    docId: workspace.id,
    blob: Buffer.from([]),
  });
  const content = await models.workspace.get(workspace.id);
  t.truthy(content);
  t.is(content!.name, 'test workspace name');
  t.is(content!.avatarKey, 'test avatar key');
});

test('should ignore update workspace content to database when parse workspace content return null', async t => {
  const { models, adapter, listener } = t.context;
  const updates: Buffer[] = [];
  {
    const doc = new YDoc();
    doc.on('update', data => {
      updates.push(Buffer.from(data));
    });

    const text = doc.getText('content');
    text.insert(0, 'hello');
    text.insert(5, 'world');
  }
  await adapter.pushDocUpdates(workspace.id, workspace.id, updates);
  const doc = await adapter.getDoc(workspace.id, workspace.id);

  const spy = Sinon.spy(models.workspace, 'update');
  await listener.markDocContentCacheStale({
    workspaceId: workspace.id,
    docId: workspace.id,
    blob: Buffer.from(doc!.bin),
  });
  t.is(spy.callCount, 0);
  const content = await models.workspace.get(workspace.id);
  t.truthy(content);
  t.is(content!.name, null);
  t.is(content!.avatarKey, null);
});
