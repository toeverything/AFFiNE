import { randomUUID } from 'node:crypto';

import { AiSession, PrismaClient, User, Workspace } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { Config } from '../../base';
import { CopilotContextModel } from '../../models/copilot-context';
import { CopilotSessionModel } from '../../models/copilot-session';
import { CopilotWorkspaceConfigModel } from '../../models/copilot-workspace';
import { UserModel } from '../../models/user';
import { WorkspaceModel } from '../../models/workspace';
import { createTestingModule, type TestingModule } from '../utils';
import { cleanObject } from '../utils/copilot';

interface Context {
  config: Config;
  module: TestingModule;
  db: PrismaClient;
  user: UserModel;
  workspace: WorkspaceModel;
  copilotSession: CopilotSessionModel;
  copilotContext: CopilotContextModel;
  copilotWorkspace: CopilotWorkspaceConfigModel;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule();
  t.context.user = module.get(UserModel);
  t.context.workspace = module.get(WorkspaceModel);
  t.context.copilotSession = module.get(CopilotSessionModel);
  t.context.copilotContext = module.get(CopilotContextModel);
  t.context.copilotWorkspace = module.get(CopilotWorkspaceConfigModel);
  t.context.db = module.get(PrismaClient);
  t.context.config = module.get(Config);
  t.context.module = module;
});

let user: User;
let workspace: Workspace;
let session: AiSession;
let docId = 'doc1';

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
  await t.context.copilotSession.createPrompt('prompt-name', 'gpt-4o');
  user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  workspace = await t.context.workspace.create(user.id);
  session = await t.context.copilotSession.create({
    sessionId: randomUUID(),
    workspaceId: workspace.id,
    docId,
    userId: user.id,
    promptName: 'prompt-name',
  });
});

test.after(async t => {
  await t.context.module.close();
});

test('should create a copilot context', async t => {
  const { id: contextId } = await t.context.copilotContext.create(session.id);
  t.truthy(contextId);

  const context = await t.context.copilotContext.get(contextId);
  t.is(context?.id, contextId, 'should get context by id');

  const config = await t.context.copilotContext.getConfig(contextId);
  t.is(config?.workspaceId, workspace.id, 'should get context config');

  const context1 = await t.context.copilotContext.getBySessionId(session.id);
  t.is(context1?.id, contextId, 'should get context by session id');
});

test('should get null for non-exist job', async t => {
  const job = await t.context.copilotContext.get('non-exist');
  t.snapshot(job, 'should return null for non-exist job');
});

test('should update context', async t => {
  const { id: contextId } = await t.context.copilotContext.create(session.id);
  const config = await t.context.copilotContext.getConfig(contextId);

  const doc = {
    id: docId,
    createdAt: Date.now(),
  };
  config?.docs.push(doc);
  await t.context.copilotContext.update(contextId, { config });

  const config1 = await t.context.copilotContext.getConfig(contextId);
  t.deepEqual(config1, config);
});

test('should insert embedding by doc id', async t => {
  const { id: contextId } = await t.context.copilotContext.create(session.id);

  {
    await t.context.copilotContext.insertFileEmbedding(contextId, 'file-id', [
      {
        index: 0,
        content: 'content',
        embedding: Array.from({ length: 1024 }, () => 1),
      },
    ]);

    {
      const ret = await t.context.copilotContext.matchFileEmbedding(
        Array.from({ length: 1024 }, () => 0.9),
        contextId,
        1,
        1
      );
      t.snapshot(
        cleanObject(ret, ['chunk', 'content', 'distance']),
        'should match file embedding'
      );
    }

    {
      await t.context.copilotContext.deleteFileEmbedding(contextId, 'file-id');
      const ret = await t.context.copilotContext.matchFileEmbedding(
        Array.from({ length: 1024 }, () => 0.9),
        contextId,
        1,
        1
      );
      t.snapshot(ret, 'should return empty array when embedding is deleted');
    }
  }

  {
    await t.context.db.snapshot.create({
      data: {
        workspaceId: workspace.id,
        id: docId,
        blob: Buffer.from([1, 1]),
        state: Buffer.from([1, 1]),
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    });

    await t.context.copilotContext.insertWorkspaceEmbedding(
      workspace.id,
      docId,
      [
        {
          index: 0,
          content: 'content',
          embedding: Array.from({ length: 1024 }, () => 1),
        },
      ]
    );

    {
      const ret = await t.context.copilotContext.hasWorkspaceEmbedding(
        workspace.id,
        [docId]
      );
      t.true(ret.has(docId), 'should return doc id when embedding is inserted');
    }

    {
      const ret = await t.context.copilotContext.matchWorkspaceEmbedding(
        Array.from({ length: 1024 }, () => 0.9),
        workspace.id,
        1,
        1
      );
      t.snapshot(
        cleanObject(ret, ['chunk', 'content', 'distance']),
        'should match workspace embedding'
      );
    }

    {
      await t.context.copilotWorkspace.updateIgnoredDocs(workspace.id, [docId]);
      const ret = await t.context.copilotContext.matchWorkspaceEmbedding(
        Array.from({ length: 1024 }, () => 0.9),
        workspace.id,
        1,
        1
      );
      t.snapshot(ret, 'should return empty array when doc is ignored');
    }

    {
      await t.context.copilotWorkspace.updateIgnoredDocs(
        workspace.id,
        undefined,
        [docId]
      );
      const ret = await t.context.copilotContext.matchWorkspaceEmbedding(
        Array.from({ length: 1024 }, () => 0.9),
        workspace.id,
        1,
        1
      );
      t.snapshot(
        cleanObject(ret, ['chunk', 'content', 'distance']),
        'should return workspace embedding'
      );
    }

    {
      await t.context.copilotContext.deleteWorkspaceEmbedding(
        workspace.id,
        docId
      );
      const ret = await t.context.copilotContext.matchWorkspaceEmbedding(
        Array.from({ length: 1024 }, () => 0.9),
        workspace.id,
        1,
        1
      );
      t.snapshot(ret, 'should return empty array when embedding deleted');
    }
  }
});

test('should check embedding table', async t => {
  {
    const ret = await t.context.copilotContext.checkEmbeddingAvailable();
    t.snapshot(ret, 'should return true when embedding table is available');
  }

  // {
  //   await t.context.db
  //     .$executeRaw`DROP TABLE IF EXISTS "ai_context_embeddings"`;
  //   const ret = await t.context.copilotContext.checkEmbeddingAvailable();
  //   t.false(ret, 'should return false when embedding table is not available');
  // }
});
