import { randomUUID } from 'node:crypto';

import { User, Workspace } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';
import { Doc as YDoc } from 'yjs';

import { createTestingApp, type TestingApp } from '../../../__tests__/utils';
import { ConfigFactory } from '../../../base';
import { Flavor } from '../../../env';
import { Models } from '../../../models';
import { DocReader, PgWorkspaceDocStorageAdapter } from '../../doc';

const test = ava as TestFn<{
  models: Models;
  app: TestingApp;
  adapter: PgWorkspaceDocStorageAdapter;
  docReader: DocReader;
}>;

test.before(async t => {
  // @ts-expect-error testing
  env.FLAVOR = Flavor.Renderer;
  const app = await createTestingApp();

  t.context.models = app.get(Models);
  t.context.adapter = app.get(PgWorkspaceDocStorageAdapter);
  t.context.docReader = app.get(DocReader);
  t.context.app = app;
});

let user: User;
let workspace: Workspace;

test.beforeEach(async t => {
  t.context.app.get(ConfigFactory).override({
    docService: {
      endpoint: t.context.app.url(),
    },
  });
  await t.context.app.initTestingDB();
  user = await t.context.models.user.create({
    email: 'test@affine.pro',
  });
  workspace = await t.context.models.workspace.create(user.id);
});

test.after.always(async t => {
  await t.context.app.close();
});

test('should render page success', async t => {
  const docId = randomUUID();
  const { app, adapter, models } = t.context;

  const doc = new YDoc();
  const text = doc.getText('content');
  const updates: Buffer[] = [];

  doc.on('update', update => {
    updates.push(Buffer.from(update));
  });

  text.insert(0, 'hello');
  text.insert(5, 'world');
  text.insert(5, ' ');

  await adapter.pushDocUpdates(workspace.id, docId, updates, user.id);
  await models.doc.publish(workspace.id, docId);

  await app.GET(`/workspace/${workspace.id}/${docId}`).expect(200);
  t.pass();
});

test('should record page view when rendering shared page', async t => {
  const docId = randomUUID();
  const { app, adapter, models, docReader } = t.context;

  const doc = new YDoc();
  const text = doc.getText('content');
  const updates: Buffer[] = [];

  doc.on('update', update => {
    updates.push(Buffer.from(update));
  });

  text.insert(0, 'analytics');
  await adapter.pushDocUpdates(workspace.id, docId, updates, user.id);
  await models.doc.publish(workspace.id, docId);

  const docContent = Sinon.stub(docReader, 'getDocContent').resolves({
    title: 'analytics-doc',
    summary: 'summary',
  });
  const record = Sinon.stub(
    models.workspaceAnalytics,
    'recordDocView'
  ).resolves();

  await app.GET(`/workspace/${workspace.id}/${docId}`).expect(200);

  t.true(record.calledOnce);
  t.like(record.firstCall.args[0], {
    workspaceId: workspace.id,
    docId,
    isGuest: true,
  });

  docContent.restore();
  record.restore();
});
