import { PrismaClient, User, Workspace } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { Config } from '../../base';
import { CopilotWorkspaceConfigModel } from '../../models/copilot-workspace';
import { UserModel } from '../../models/user';
import { WorkspaceModel } from '../../models/workspace';
import { createTestingModule, type TestingModule } from '../utils';

interface Context {
  config: Config;
  module: TestingModule;
  db: PrismaClient;
  user: UserModel;
  workspace: WorkspaceModel;
  copilotWorkspace: CopilotWorkspaceConfigModel;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule();
  t.context.user = module.get(UserModel);
  t.context.workspace = module.get(WorkspaceModel);
  t.context.copilotWorkspace = module.get(CopilotWorkspaceConfigModel);
  t.context.db = module.get(PrismaClient);
  t.context.config = module.get(Config);
  t.context.module = module;
});

let user: User;
let workspace: Workspace;

let docId = 'doc1';

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
  user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  workspace = await t.context.workspace.create(user.id);
});

test.after(async t => {
  await t.context.module.close();
});

test('should manage copilot workspace ignored docs', async t => {
  const ignoredDocs = await t.context.copilotWorkspace.listIgnoredDocs(
    workspace.id
  );
  t.deepEqual(ignoredDocs, []);

  {
    const count = await t.context.copilotWorkspace.updateIgnoredDocs(
      workspace.id,
      [docId]
    );
    t.is(count, 1, 'should add ignored doc');

    const ret = await t.context.copilotWorkspace.listIgnoredDocs(workspace.id);
    t.deepEqual(ret, [docId], 'should return added doc');

    const check = await t.context.copilotWorkspace.checkIgnoredDocs(
      workspace.id,
      [docId]
    );
    t.deepEqual(check, [docId], 'should return ignored docs in workspace');
  }

  {
    const count = await t.context.copilotWorkspace.updateIgnoredDocs(
      workspace.id,
      [docId]
    );
    t.is(count, 1, 'should not add ignored doc again');

    const ret = await t.context.copilotWorkspace.listIgnoredDocs(workspace.id);
    t.deepEqual(ret, [docId], 'should not add ignored doc again');
  }

  {
    const count = await t.context.copilotWorkspace.updateIgnoredDocs(
      workspace.id,
      ['new_doc']
    );
    t.is(count, 2, 'should add new ignored doc');

    const ret = await t.context.copilotWorkspace.listIgnoredDocs(workspace.id);
    t.deepEqual(ret, [docId, 'new_doc'], 'should add ignored doc');
  }

  {
    await t.context.copilotWorkspace.updateIgnoredDocs(
      workspace.id,
      undefined,
      [docId]
    );

    const ret = await t.context.copilotWorkspace.listIgnoredDocs(workspace.id);
    t.deepEqual(ret, ['new_doc'], 'should remove ignored doc');
  }
});

test('should insert and search embedding', async t => {
  {
    await t.context.copilotWorkspace.addWorkspaceFile(
      workspace.id,
      {
        fileName: 'file1',
        mimeType: 'text/plain',

        size: 1,
      },
      [
        {
          index: 0,
          content: 'content',
          embedding: Array.from({ length: 1024 }, () => 1),
        },
      ]
    );

    {
      const ret = await t.context.copilotWorkspace.matchWorkspaceFileEmbedding(
        workspace.id,
        Array.from({ length: 1024 }, () => 0.9),
        1,
        1
      );
      t.is(ret.length, 1);
      t.is(ret[0].content, 'content');
    }
  }
});

test('should check embedding table', async t => {
  {
    const ret = await t.context.copilotWorkspace.checkEmbeddingAvailable();
    t.true(ret, 'should return true when embedding table is available');
  }

  // {
  //   await t.context.db
  //     .$executeRaw`DROP TABLE IF EXISTS "ai_workspace_file_embeddings"`;
  //   const ret = await t.context.copilotWorkspace.checkEmbeddingAvailable();
  //   t.false(ret, 'should return false when embedding table is not available');
  // }
});
