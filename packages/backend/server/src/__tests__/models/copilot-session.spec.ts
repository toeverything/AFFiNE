import { randomUUID } from 'node:crypto';

import { PrismaClient, User, Workspace } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { CopilotSessionModel, UserModel, WorkspaceModel } from '../../models';
import { createTestingModule, type TestingModule } from '../utils';

interface Context {
  module: TestingModule;
  db: PrismaClient;
  user: UserModel;
  workspace: WorkspaceModel;
  copilotSession: CopilotSessionModel;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule();
  t.context.user = module.get(UserModel);
  t.context.workspace = module.get(WorkspaceModel);
  t.context.copilotSession = module.get(CopilotSessionModel);
  t.context.db = module.get(PrismaClient);
  t.context.module = module;
});

let user: User;
let workspace: Workspace;

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

test('list method correctly filters session types', async t => {
  const { copilotSession, db } = t.context;

  await copilotSession.createPrompt('test-prompt', 'gpt-4.1');

  const sessions = {
    workspace: randomUUID(),
    pinned: randomUUID(),
    doc: randomUUID(),
  };
  const commonParams = {
    userId: user.id,
    workspaceId: workspace.id,
    promptName: 'test-prompt',
    docId: randomUUID(),
  };

  await db.aiSession.createMany({
    data: [
      { id: sessions.workspace, ...commonParams, docId: null },
      { id: sessions.pinned, ...commonParams, docId: workspace.id },
      { id: sessions.doc, ...commonParams },
    ],
  });

  // workspace sessions
  {
    const workspaceSessions = await copilotSession.list(
      commonParams.userId,
      commonParams.workspaceId,
      undefined
    );
    t.is(workspaceSessions.length, 1);
    t.is(workspaceSessions[0].id, sessions.workspace);
    t.is(workspaceSessions[0].docId, null);
  }

  // pinned session
  {
    const pinnedSessions = await copilotSession.list(
      commonParams.userId,
      commonParams.workspaceId,
      commonParams.workspaceId
    );
    t.is(pinnedSessions.length, 1);
    t.is(pinnedSessions[0].id, sessions.pinned);
    t.is(pinnedSessions[0].docId, commonParams.workspaceId);
  }

  // doc session
  {
    const docSessions = await copilotSession.list(
      commonParams.userId,
      commonParams.workspaceId,
      commonParams.docId
    );
    t.is(docSessions.length, 1);
    t.is(docSessions[0].id, sessions.doc);
    t.is(docSessions[0].docId, commonParams.docId);
  }
});
