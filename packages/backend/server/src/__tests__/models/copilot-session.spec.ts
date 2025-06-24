import { randomUUID } from 'node:crypto';

import { PrismaClient, User, Workspace } from '@prisma/client';
import ava, { ExecutionContext, TestFn } from 'ava';

import { CopilotPromptInvalid, CopilotSessionInvalidInput } from '../../base';
import {
  CopilotSessionModel,
  UpdateChatSessionData,
  UserModel,
  WorkspaceModel,
} from '../../models';
import { createTestingModule, type TestingModule } from '../utils';
import { cleanObject } from '../utils/copilot';

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

const createTestPrompts = async (
  copilotSession: CopilotSessionModel,
  db: PrismaClient
) => {
  await copilotSession.createPrompt('test-prompt', 'gpt-4.1');
  await db.aiPrompt.create({
    data: { name: 'action-prompt', model: 'gpt-4.1', action: 'edit' },
  });
};

const createTestSession = async (
  t: ExecutionContext<Context>,
  overrides: Partial<{
    sessionId: string;
    userId: string;
    workspaceId: string;
    docId: string | null;
    pinned: boolean;
    promptName: string;
    promptAction: string | null;
  }> = {}
) => {
  const sessionData = {
    sessionId: randomUUID(),
    userId: user.id,
    workspaceId: workspace.id,
    docId: null,
    pinned: false,
    promptName: 'test-prompt',
    promptAction: null,
    ...overrides,
  };

  await t.context.copilotSession.create(sessionData);
  return sessionData;
};

const getSessionState = async (db: PrismaClient, sessionId: string) => {
  const session = await db.aiSession.findUnique({
    where: { id: sessionId },
    select: { id: true, pinned: true, docId: true },
  });
  return session;
};

test('should list and filter session type', async t => {
  const { copilotSession, db } = t.context;

  await createTestPrompts(copilotSession, db);

  const docId = 'doc-id-1';
  await createTestSession(t, { sessionId: randomUUID() });
  await createTestSession(t, { sessionId: randomUUID(), pinned: true });
  await createTestSession(t, { sessionId: randomUUID(), docId });
  await createTestSession(t, {
    sessionId: randomUUID(),
    docId,
    promptName: 'action-prompt',
    promptAction: 'action',
  });

  // should list sessions
  {
    const workspaceSessions = await copilotSession.list({
      userId: user.id,
      workspaceId: workspace.id,
    });

    t.snapshot(
      workspaceSessions.map(s => ({ docId: s.docId, pinned: s.pinned })),
      'workspace sessions should include workspace and pinned sessions'
    );
  }

  {
    const docSessions = await copilotSession.list({
      userId: user.id,
      workspaceId: workspace.id,
      docId,
    });

    t.snapshot(
      cleanObject(
        docSessions.toSorted(s =>
          s.docId!.localeCompare(s.docId!, undefined, { numeric: true })
        ),
        ['id', 'userId', 'workspaceId', 'createdAt', 'tokenCost']
      ),
      'doc sessions should only include sessions with matching docId'
    );
  }

  // should identify session types
  {
    // check get session type
    const testCases = [
      { docId: null, pinned: false },
      { docId: undefined, pinned: false },
      { docId: null, pinned: true },
      { docId, pinned: false },
    ];

    const sessionTypeResults = testCases.map(session => ({
      session,
      type: copilotSession.getSessionType(session),
    }));

    t.snapshot(sessionTypeResults, 'session type identification results');
  }
});

test('should check session validation for prompts', async t => {
  const { copilotSession, db } = t.context;

  await createTestPrompts(copilotSession, db);

  const docId = randomUUID();
  const sessionTypes = [
    { name: 'workspace', session: { docId: null, pinned: false } },
    { name: 'pinned', session: { docId: null, pinned: true } },
    { name: 'doc', session: { docId, pinned: false } },
  ];

  // non-action prompts should work for all session types
  sessionTypes.forEach(({ name, session }) => {
    t.notThrows(
      () =>
        copilotSession.checkSessionPrompt(session, 'test-prompt', undefined),
      `${name} session should allow non-action prompts`
    );
  });

  // action prompts should only work for doc session type
  {
    const actionPromptTests = [
      {
        name: 'workspace',
        session: sessionTypes[0].session,
        shouldThrow: true,
      },
      { name: 'pinned', session: sessionTypes[1].session, shouldThrow: true },
      { name: 'doc', session: sessionTypes[2].session, shouldThrow: false },
    ];

    actionPromptTests.forEach(({ name, session, shouldThrow }) => {
      if (shouldThrow) {
        t.throws(
          () =>
            copilotSession.checkSessionPrompt(session, 'action-prompt', 'edit'),
          { instanceOf: CopilotPromptInvalid },
          `${name} session should reject action prompts`
        );
      } else {
        t.notThrows(
          () =>
            copilotSession.checkSessionPrompt(session, 'action-prompt', 'edit'),
          `${name} session should allow action prompts`
        );
      }
    });
  }
});

test('should pin and unpin sessions', async t => {
  const { copilotSession, db } = t.context;

  await createTestPrompts(copilotSession, db);

  const firstSessionId = 'first-session-id';
  const secondSessionId = 'second-session-id';
  const thirdSessionId = 'third-session-id';

  // should unpin existing pinned session when creating a new one
  {
    await copilotSession.create({
      sessionId: firstSessionId,
      userId: user.id,
      workspaceId: workspace.id,
      docId: null,
      promptName: 'test-prompt',
      promptAction: null,
      pinned: true,
    });

    const firstSession = await copilotSession.get(firstSessionId);
    t.truthy(firstSession, 'first session should be created successfully');
    t.is(firstSession?.pinned, true, 'first session should be pinned');

    // should unpin the first one when creating second pinned session
    await copilotSession.create({
      sessionId: secondSessionId,
      userId: user.id,
      workspaceId: workspace.id,
      docId: null,
      promptName: 'test-prompt',
      promptAction: null,
      pinned: true,
    });

    const sessionStatesAfterSecondPin = await Promise.all([
      getSessionState(db, firstSessionId),
      getSessionState(db, secondSessionId),
    ]);

    t.snapshot(
      sessionStatesAfterSecondPin,
      'session states after creating second pinned session'
    );
  }

  // should can unpin a pinned session
  {
    await createTestSession(t, { sessionId: thirdSessionId, pinned: true });
    const unpinResult = await copilotSession.unpin(workspace.id, user.id);
    t.is(
      unpinResult,
      true,
      'unpin operation should return true when sessions are unpinned'
    );

    const unpinResultAgain = await copilotSession.unpin(workspace.id, user.id);
    t.snapshot(
      unpinResultAgain,
      'should return false when no sessions to unpin'
    );
  }

  // should unpin all sessions
  {
    const allSessionsAfterUnpin = await db.aiSession.findMany({
      where: { id: { in: [firstSessionId, secondSessionId, thirdSessionId] } },
      select: { pinned: true, id: true },
      orderBy: { id: 'asc' },
    });

    t.snapshot(
      allSessionsAfterUnpin,
      'all sessions should be unpinned after unpin operation'
    );
  }
});

test('should handle session updates and validations', async t => {
  const { copilotSession, db } = t.context;
  await createTestPrompts(copilotSession, db);

  const sessionId = 'session-update-id';
  const actionSessionId = 'action-session-id';
  const parentSessionId = 'parent-session-id';
  const forkedSessionId = 'forked-session-id';
  const docId = 'doc-update-id';

  await createTestSession(t, { sessionId });
  await createTestSession(t, {
    sessionId: actionSessionId,
    promptName: 'action-prompt',
    promptAction: 'edit',
    docId: 'some-doc',
  });
  await createTestSession(t, {
    sessionId: parentSessionId,
    docId: 'parent-doc',
  });
  await db.aiSession.create({
    data: {
      id: forkedSessionId,
      workspaceId: workspace.id,
      userId: user.id,
      docId: 'forked-doc',
      pinned: false,
      promptName: 'test-prompt',
      promptAction: null,
      parentSessionId: parentSessionId,
    },
  });

  const assertUpdateThrows = async (
    t: ExecutionContext<Context>,
    sessionId: string,
    updateData: UpdateChatSessionData,
    message: string
  ) => {
    await t.throwsAsync(
      t.context.copilotSession.update(user.id, sessionId, updateData),
      { instanceOf: CopilotSessionInvalidInput },
      message
    );
  };

  const assertUpdate = async (
    t: ExecutionContext<Context>,
    sessionId: string,
    updateData: UpdateChatSessionData,
    message: string
  ) => {
    await t.notThrowsAsync(
      t.context.copilotSession.update(user.id, sessionId, updateData),
      message
    );
  };

  // case 1: action sessions should reject all updates
  {
    const actionUpdates = [
      { docId: 'new-doc' },
      { pinned: true },
      { promptName: 'test-prompt' },
    ];
    for (const data of actionUpdates) {
      await assertUpdateThrows(
        t,
        actionSessionId,
        data,
        `action session should reject update: ${JSON.stringify(data)}`
      );
    }
  }

  // case 2: forked sessions should reject docId updates but allow others
  {
    await assertUpdate(
      t,
      forkedSessionId,
      { pinned: true },
      'forked session should allow pinned update'
    );
    await assertUpdate(
      t,
      forkedSessionId,
      { promptName: 'test-prompt' },
      'forked session should allow promptName update'
    );
    await assertUpdateThrows(
      t,
      forkedSessionId,
      { docId: 'new-doc' },
      'forked session should reject docId update'
    );
  }

  {
    // case 3: prompt update validation
    await assertUpdate(
      t,
      sessionId,
      { promptName: 'test-prompt' },
      'should allow valid non-action prompt'
    );
    await assertUpdateThrows(
      t,
      sessionId,
      { promptName: 'action-prompt' },
      'should reject action prompt'
    );
    await assertUpdateThrows(
      t,
      sessionId,
      { promptName: 'non-existent-prompt' },
      'should reject non-existent prompt'
    );
  }

  // cest 4: session type conversions and pinning behavior
  {
    const existingPinnedId = 'existing-pinned-session-id';
    await createTestSession(t, { sessionId: existingPinnedId, pinned: true });

    // should unpin existing when pinning new session
    await copilotSession.update(user.id, sessionId, { pinned: true });

    const sessionStatesAfterPin = await Promise.all([
      getSessionState(db, sessionId),
      getSessionState(db, existingPinnedId),
    ]);
    t.snapshot(
      sessionStatesAfterPin,
      'should unpin existing when pinning new session'
    );
  }

  // test type conversions
  {
    const conversionSteps: any[] = [];
    const convertSession = async (
      step: string,
      data: UpdateChatSessionData
    ) => {
      await copilotSession.update(user.id, sessionId, data);
      const session = await db.aiSession.findUnique({
        where: { id: sessionId },
        select: { docId: true, pinned: true },
      });
      conversionSteps.push({
        step,
        session,
        type: copilotSession.getSessionType(session!),
      });
    };

    const conversions = [
      ['pinned_to_doc', { docId, pinned: false }],
      ['doc_to_workspace', { docId: null }],
      ['workspace_to_pinned', { pinned: true }],
    ] as const;

    for (const [step, data] of conversions) {
      await convertSession(step, data);
    }

    t.snapshot(conversionSteps, 'session type conversion steps');
  }
});
