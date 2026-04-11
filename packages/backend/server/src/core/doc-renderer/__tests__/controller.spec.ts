import { randomUUID } from 'node:crypto';

import { User, Workspace } from '@prisma/client';
import ava, { ExecutionContext, TestFn } from 'ava';
import Sinon from 'sinon';
import { Doc as YDoc } from 'yjs';

import { createTestingApp, type TestingApp } from '../../../__tests__/utils';
import { ConfigFactory } from '../../../base';
import { Flavor } from '../../../env';
import { Models } from '../../../models';
import { DocReader, PgWorkspaceDocStorageAdapter } from '../../doc';

interface Context {
  models: Models;
  app: TestingApp;
  adapter: PgWorkspaceDocStorageAdapter;
  docReader: DocReader;
}

const test = ava as TestFn<Context>;

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

async function createDoc(
  adapter: PgWorkspaceDocStorageAdapter,
  content: string
) {
  const docId = randomUUID();
  const doc = new YDoc();
  const text = doc.getText('content');
  const updates: Buffer[] = [];

  doc.on('update', update => {
    updates.push(Buffer.from(update));
  });

  text.insert(0, content);
  await adapter.pushDocUpdates(workspace.id, docId, updates, user.id);
  return docId;
}

test('should render page success', async t => {
  const { app, adapter, models } = t.context;
  const docId = await createDoc(adapter, 'hello world');

  await models.doc.publish(workspace.id, docId);

  await app.GET(`/workspace/${workspace.id}/${docId}`).expect(200);
  t.pass();
});

test('should record page view when rendering shared page', async t => {
  const { app, adapter, models, docReader } = t.context;
  const docId = await createDoc(adapter, 'analytics');
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

const policyCases: Array<{
  title: string;
  content: string;
  expectedStatus: number;
  setup: (
    models: Models,
    docId: string,
    docReader: DocReader
  ) => Promise<{
    markdown?: Sinon.SinonStub;
    docContent?: Sinon.SinonStub;
    record?: Sinon.SinonStub;
  }>;
  request: (app: TestingApp, docId: string) => ReturnType<TestingApp['GET']>;
  assert: (
    t: ExecutionContext<Context>,
    res: Awaited<ReturnType<TestingApp['GET']>>,
    stubs: {
      markdown?: Sinon.SinonStub;
      docContent?: Sinon.SinonStub;
      record?: Sinon.SinonStub;
    },
    docId: string
  ) => void;
}> = [
  {
    title:
      'should return markdown content and skip page view when accept is text/markdown',
    content: 'markdown',
    expectedStatus: 200,
    setup: async (models, docId, docReader) => {
      await models.doc.publish(workspace.id, docId);
      return {
        markdown: Sinon.stub(docReader, 'getDocMarkdown').resolves({
          title: 'markdown-doc',
          markdown: '# markdown-doc',
          knownUnsupportedBlocks: [],
          unknownBlocks: [],
        }),
        docContent: Sinon.stub(docReader, 'getDocContent'),
        record: Sinon.stub(
          models.workspaceAnalytics,
          'recordDocView'
        ).resolves(),
      };
    },
    request: (app, docId) =>
      app
        .GET(`/workspace/${workspace.id}/${docId}`)
        .set('accept', 'text/markdown'),
    assert: (t, res, stubs, docId) => {
      t.true(stubs.markdown?.calledOnceWithExactly(workspace.id, docId, false));
      t.is(res.text, '# markdown-doc');
      t.true(
        (res.headers['content-type'] as string).startsWith('text/markdown')
      );
      t.true(stubs.docContent?.notCalled);
      t.true(stubs.record?.notCalled);
    },
  },
  {
    title:
      'should not return markdown for private page even if workspace preview is enabled',
    content: 'private markdown',
    expectedStatus: 404,
    setup: async (models, _docId, docReader) => {
      await models.workspace.update(workspace.id, {
        enableUrlPreview: true,
      });
      return {
        markdown: Sinon.stub(docReader, 'getDocMarkdown'),
      };
    },
    request: (app, docId) =>
      app
        .GET(`/workspace/${workspace.id}/${docId}`)
        .set('accept', 'text/markdown'),
    assert: (t, _res, stubs) => {
      t.true(stubs.markdown?.notCalled);
    },
  },
  {
    title: 'should not render shared page when workspace sharing is disabled',
    content: 'shared but disabled',
    expectedStatus: 200,
    setup: async (models, docId, docReader) => {
      await models.doc.publish(workspace.id, docId);
      await models.workspace.update(workspace.id, {
        enableSharing: false,
        enableUrlPreview: true,
      });
      return {
        docContent: Sinon.stub(docReader, 'getDocContent'),
      };
    },
    request: (app, docId) => app.GET(`/workspace/${workspace.id}/${docId}`),
    assert: (t, res, stubs) => {
      t.true(stubs.docContent?.notCalled);
      t.is(res.headers['x-robots-tag'], 'noindex');
    },
  },
];

for (const policyCase of policyCases) {
  test(policyCase.title, async t => {
    const { app, adapter, models, docReader } = t.context;
    const docId = await createDoc(adapter, policyCase.content);
    const stubs = await policyCase.setup(models, docId, docReader);

    try {
      const res = await policyCase
        .request(app, docId)
        .expect(policyCase.expectedStatus);
      policyCase.assert(t, res, stubs, docId);
    } finally {
      stubs.markdown?.restore();
      stubs.docContent?.restore();
      stubs.record?.restore();
    }
  });
}
