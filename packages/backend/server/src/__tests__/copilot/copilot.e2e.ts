import { randomUUID } from 'node:crypto';

import serverNativeModule from '@affine/server-native';
import { ProjectRoot } from '@affine-tools/utils/path';
import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';
import Sinon from 'sinon';

import { AppModule } from '../../app.module';
import { JobQueue } from '../../base';
import { ConfigModule } from '../../base/config';
import { AuthService } from '../../core/auth';
import { DocReader } from '../../core/doc';
import { QuotaService } from '../../core/quota';
import { ContextCategories, DocRole, WorkspaceRole } from '../../models';
import { CompatSubmissionStore } from '../../plugins/copilot/compat/submission-store';
import { CopilotContextService } from '../../plugins/copilot/context';
import {
  CopilotEmbeddingJob,
  MockEmbeddingClient,
} from '../../plugins/copilot/embedding';
import { PromptService } from '../../plugins/copilot/prompt';
import {
  CopilotProviderFactory,
  CopilotProviderType,
  GeminiGenerativeProvider,
  OpenAIProvider,
} from '../../plugins/copilot/providers';
import { CapabilityRuntime } from '../../plugins/copilot/runtime/capability-runtime';
import { ChatSessionService } from '../../plugins/copilot/session';
import { CopilotStorage } from '../../plugins/copilot/storage';
import {
  installMockCopilotRuntime,
  MockCopilotProvider,
  Mockers,
} from '../mocks';
import { TestingPromptService } from '../mocks/prompt-service.mock';
import {
  acceptInviteById,
  createTestingApp,
  createWorkspace,
  inviteUser,
  smallestPng,
  TestingApp,
  TestUser,
} from '../utils';
import {
  addContextCategory,
  addContextDoc,
  addContextFile,
  array2sse,
  chatWithActionStream,
  chatWithImages,
  chatWithStreamObject,
  chatWithText,
  chatWithTextStream,
  cleanObject,
  createCopilotContext,
  createCopilotMessage,
  createCopilotSession,
  createDocCopilotSession,
  createPinnedCopilotSession,
  createWorkspaceCopilotSession,
  forkCopilotSession,
  getCopilotSession,
  getDocSessions,
  getHistories,
  getPinnedSessions,
  getTranscriptTask,
  getWorkspaceSessions,
  listContext,
  listContextCategories,
  listContextDocAndFiles,
  matchFiles,
  matchWorkspaceDocs,
  settleTranscriptTask,
  sse2array,
  submitTranscriptTask,
  textToEventStream,
  unsplashSearch,
  updateCopilotSession,
} from '../utils/copilot';

const test = ava as TestFn<{
  auth: AuthService;
  app: TestingApp;
  db: PrismaClient;
  context: CopilotContextService;
  jobs: CopilotEmbeddingJob;
  prompt: TestingPromptService;
  factory: CopilotProviderFactory;
  storage: CopilotStorage;
  u1: TestUser;
}>;
let restoreMockCopilotRuntime: (() => void) | undefined;

const waitForStatus = async (
  loadStatus: () => Promise<string | undefined>,
  expected: string,
  description: string,
  attempts = 30,
  intervalMs = 1000
) => {
  let status = await loadStatus();
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (status === expected) {
      return status;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    status = await loadStatus();
  }
  throw new Error(
    `${description} did not reach status "${expected}", last status: ${
      status ?? 'undefined'
    }`
  );
};

test.before(async t => {
  restoreMockCopilotRuntime = installMockCopilotRuntime();
  const app = await createTestingApp({
    imports: [
      ConfigModule.override({
        copilot: {
          providers: {
            openai: { apiKey: '1' },
            fal: {},
            gemini: { apiKey: '1' },
          },
          unsplash: {
            key: process.env.UNSPLASH_ACCESS_KEY || '1',
          },
        },
      }),
      AppModule,
    ],
    tapModule: m => {
      // use real JobQueue for testing
      m.overrideProvider(JobQueue).useClass(JobQueue);
      m.overrideProvider(DocReader).useValue({
        getFullDocContent() {
          return {
            title: '1',
            summary: '1',
          };
        },
        getWorkspaceContent() {
          return {};
        },
      });
      m.overrideProvider(PromptService).useClass(TestingPromptService);
      m.overrideProvider(OpenAIProvider).useClass(MockCopilotProvider);
      m.overrideProvider(GeminiGenerativeProvider).useClass(
        class MockGenerativeProvider extends MockCopilotProvider {
          // @ts-expect-error type not typed
          override type: CopilotProviderType = CopilotProviderType.Gemini;
        }
      );
    },
  });

  const auth = app.get(AuthService);
  const db = app.get(PrismaClient);
  const context = app.get(CopilotContextService);
  const prompt = app.get(PromptService) as TestingPromptService;
  const storage = app.get(CopilotStorage);
  const jobs = app.get(CopilotEmbeddingJob);

  t.context.app = app;
  t.context.db = db;
  t.context.auth = auth;
  t.context.context = context;
  t.context.prompt = prompt;
  t.context.storage = storage;
  t.context.jobs = jobs;
});

let textPromptName = 'prompt';
let imagePromptName = 'prompt-image';

test.beforeEach(async t => {
  Sinon.restore();
  const { app, prompt } = t.context;
  await app.initTestingDB();
  prompt.reset();
  t.context.u1 = await app.signupV1();
  textPromptName = randomUUID().replaceAll('-', '');
  imagePromptName = randomUUID().replaceAll('-', '');

  await prompt.set(textPromptName, 'test', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  await prompt.set(imagePromptName, 'test-image', [
    { role: 'system', content: 'hello {{word}}' },
  ]);
});

test.after.always(async t => {
  restoreMockCopilotRuntime?.();
  await t.context.app.close();
});

// ==================== session ====================

test('should create session correctly', async t => {
  const { app, u1 } = t.context;

  const assertCreateSession = async (
    workspaceId: string,
    error: string,
    asserter = async (x: any) => {
      t.truthy(await x, error);
    }
  ) => {
    await asserter(
      createCopilotSession(app, workspaceId, randomUUID(), textPromptName)
    );
  };

  {
    const { id } = await createWorkspace(app);
    await assertCreateSession(
      id,
      'should be able to create session with cloud workspace that user can access'
    );
  }

  {
    await assertCreateSession(
      randomUUID(),
      'should be able to create session with local workspace'
    );
  }

  {
    const u2 = await app.createUser();
    const { id } = await createWorkspace(app);
    await app.login(u2);
    await assertCreateSession(id, '', async x => {
      await t.throwsAsync(
        x,
        { instanceOf: Error },
        'should not able to create session with cloud workspace that user cannot access'
      );
    });

    await app.switchUser(u1);
    const inviteId = await inviteUser(app, id, u2.email);
    await app.login(u2);
    await acceptInviteById(app, id, inviteId, false);
    await assertCreateSession(
      id,
      'should able to create session after user have permission'
    );
  }
});

test('should update session correctly', async t => {
  const { app } = t.context;

  const assertUpdateSession = async (
    sessionId: string,
    error: string,
    asserter = async (x: any) => {
      t.truthy(await x, error);
    }
  ) => {
    await asserter(updateCopilotSession(app, sessionId, textPromptName));
  };

  {
    const { id: workspaceId } = await createWorkspace(app);
    const docId = randomUUID();
    const sessionId = await createCopilotSession(
      app,
      workspaceId,
      docId,
      textPromptName
    );
    await assertUpdateSession(
      sessionId,
      'should be able to update session with cloud workspace that user can access'
    );
  }

  {
    const sessionId = await createCopilotSession(
      app,
      randomUUID(),
      randomUUID(),
      textPromptName
    );
    await assertUpdateSession(
      sessionId,
      'should be able to update session with local workspace'
    );
  }

  {
    await app.signupV1();
    const u2 = await app.createUser();
    const { id: workspaceId } = await createWorkspace(app);
    const inviteId = await inviteUser(app, workspaceId, u2.email);
    await app.login(u2);
    await acceptInviteById(app, workspaceId, inviteId, false);
    const sessionId = await createCopilotSession(
      app,
      workspaceId,
      randomUUID(),
      textPromptName
    );
    await assertUpdateSession(
      sessionId,
      'should able to update session after user have permission'
    );
  }

  {
    const sessionId = '123456';
    await assertUpdateSession(sessionId, '', async x => {
      await t.throwsAsync(
        x,
        { instanceOf: Error },
        'should not able to update invalid session id'
      );
    });
  }
});

test('should fetch action session by session id', async t => {
  const { app } = t.context;
  const { id: workspaceId } = await createWorkspace(app);
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    randomUUID(),
    'Generate image'
  );

  const session = await getCopilotSession(app, workspaceId, sessionId);
  t.truthy(session);
  t.is(session.id, sessionId);
  t.is(session.promptName, 'Generate image');
});

test('should fork session correctly', async t => {
  const { app, u1 } = t.context;

  const assertForkSession = async (
    workspaceId: string,
    docId: string,
    sessionId: string,
    lastMessageId: string | undefined,
    error: string,
    asserter = async (x: any) => {
      const forkedSessionId = await x;
      t.truthy(forkedSessionId, error);
      return forkedSessionId;
    }
  ) =>
    await asserter(
      forkCopilotSession(app, workspaceId, docId, sessionId, lastMessageId)
    );

  // prepare session
  const { id } = await createWorkspace(app);
  const docId = randomUUID();
  const sessionId = await createCopilotSession(app, id, docId, textPromptName);

  let forkedSessionId: string;
  // should be able to fork session
  {
    for (let i = 0; i < 3; i++) {
      const messageId = await createCopilotMessage(app, sessionId);
      await chatWithText(app, sessionId, messageId);
    }
    const histories = await getHistories(app, { workspaceId: id, docId });
    const latestMessageId = histories[0].messages.findLast(
      m => m.role === 'assistant'
    )?.id;
    t.truthy(latestMessageId, 'should find last message id');

    // should be able to fork session
    forkedSessionId = await assertForkSession(
      id,
      docId,
      sessionId,
      latestMessageId!,
      'should be able to fork session with cloud workspace that user can access'
    );
  }

  // should be able to fork session without latestMessageId (copy all messages)
  {
    forkedSessionId = await assertForkSession(
      id,
      docId,
      sessionId,
      undefined,
      'should be able to fork session without latestMessageId'
    );
  }

  // should not be able to fork session with wrong latestMessageId
  {
    await assertForkSession(
      id,
      docId,
      sessionId,
      'wrong-message-id',
      '',
      async x => {
        await t.throwsAsync(
          x,
          { instanceOf: Error },
          'should not able to fork session with wrong latestMessageId'
        );
      }
    );
  }

  {
    const u2 = await app.signupV1();
    await assertForkSession(id, docId, sessionId, randomUUID(), '', async x => {
      await t.throwsAsync(
        x,
        { instanceOf: Error },
        'should not able to fork session with cloud workspace that user cannot access'
      );
    });

    await app.switchUser(u1);
    const inviteId = await inviteUser(app, id, u2.email);
    await app.switchUser(u2);
    await acceptInviteById(app, id, inviteId, false);
    await assertForkSession(id, docId, sessionId, randomUUID(), '', async x => {
      await t.throwsAsync(
        x,
        { instanceOf: Error },
        'should not able to fork a root session from other user'
      );
    });

    await app.switchUser(u1);
    const histories = await getHistories(app, { workspaceId: id, docId });
    const latestMessageId = histories
      .find(h => h.sessionId === forkedSessionId)
      ?.messages.findLast(m => m.role === 'assistant')?.id;
    t.truthy(latestMessageId, 'should find latest message id');

    await app.switchUser(u2);
    await assertForkSession(
      id,
      docId,
      forkedSessionId,
      latestMessageId!,
      'should able to fork a forked session created by other user'
    );
  }
});

test('should be able to use test provider', async t => {
  const { app } = t.context;

  const { id } = await createWorkspace(app);
  t.truthy(
    await createCopilotSession(app, id, randomUUID(), textPromptName),
    'failed to create session'
  );
});

// ==================== message ====================

test('should create message correctly', async t => {
  const { app } = t.context;
  const pngData = await fetch(smallestPng).then(res => res.arrayBuffer());
  const cases = [
    {
      title: 'should be able to create message with valid session',
      invoke: (sessionId: string) => createCopilotMessage(app, sessionId),
    },
    {
      title: 'should be able to create message with url link',
      invoke: (sessionId: string) =>
        createCopilotMessage(app, sessionId, undefined, [
          'http://example.com/cat.jpg',
        ]),
    },
    {
      title: 'should be able to create message with blob',
      invoke: (sessionId: string) =>
        createCopilotMessage(
          app,
          sessionId,
          undefined,
          undefined,
          new File([new Uint8Array(pngData)], '1.png', { type: 'image/png' })
        ),
    },
    {
      title: 'should be able to create message with blobs',
      invoke: (sessionId: string) =>
        createCopilotMessage(app, sessionId, undefined, undefined, undefined, [
          new File([new Uint8Array(pngData)], '1.png', { type: 'image/png' }),
        ]),
    },
  ];

  for (const testCase of cases) {
    const { id } = await createWorkspace(app);
    const sessionId = await createCopilotSession(
      app,
      id,
      randomUUID(),
      textPromptName
    );
    const messageId = await testCase.invoke(sessionId);
    t.truthy(messageId, testCase.title);
  }

  {
    await t.throwsAsync(
      createCopilotMessage(app, randomUUID()),
      { instanceOf: Error },
      'should not able to create message with invalid session'
    );
  }
});

// ==================== chat ====================

test('should be able to chat with api', async t => {
  const { app, storage } = t.context;

  Sinon.stub(storage, 'handleRemoteLink').resolvesArg(2);

  const { id } = await createWorkspace(app);
  {
    const docId = randomUUID();
    const sessionId = await createCopilotSession(
      app,
      id,
      docId,
      textPromptName
    );
    const messageId = await createCopilotMessage(app, sessionId);
    const ret = await chatWithText(app, sessionId, messageId);
    t.is(
      ret,
      'generate text to text stream',
      'should be able to chat with text'
    );

    const ret2 = await chatWithTextStream(app, sessionId, messageId);
    t.is(
      ret2,
      textToEventStream('generate text to text stream', messageId),
      'should be able to chat with text stream'
    );

    const [history] = await getHistories(app, { workspaceId: id, docId });
    const persistedMessageIds = history?.messages
      .filter(message => message.role !== 'system')
      .map(message => message.id);
    t.deepEqual(
      persistedMessageIds?.every(id => typeof id === 'string' && id.length > 0),
      true,
      'should persist non-empty database-generated ids for chat turns'
    );
    t.is(
      new Set(persistedMessageIds).size,
      persistedMessageIds?.length ?? 0,
      'should persist unique ids for chat turns'
    );
  }

  {
    const sessionId = await createCopilotSession(
      app,
      id,
      randomUUID(),
      imagePromptName
    );
    const messageId = await createCopilotMessage(app, sessionId);
    const ret3 = await chatWithImages(app, sessionId, messageId);
    t.is(
      array2sse(sse2array(ret3).filter(e => e.event !== 'event')),
      textToEventStream(
        ['https://example.com/gpt-image-1.jpg'],
        messageId,
        'attachment'
      ),
      'should be able to chat with images'
    );
  }

  {
    const sessionId = await createCopilotSession(
      app,
      id,
      randomUUID(),
      textPromptName
    );
    const messageId = await createCopilotMessage(app, sessionId);

    const ret4 = await chatWithStreamObject(app, sessionId, messageId);

    const objects = Array.from('generate text to text stream').map(data =>
      JSON.stringify({ type: 'text-delta', textDelta: data })
    );

    t.is(
      ret4,
      textToEventStream(objects, messageId),
      'should be able to chat with stream object'
    );
  }

  Sinon.restore();
});

test('should be able to chat with api by action stream', async t => {
  const { app, db, prompt } = t.context;

  const { id } = await createWorkspace(app);
  const beforeQuota = await app.gql(
    `
      query getCopilotQuota($workspaceId: String!) {
        currentUser {
          copilot(workspaceId: $workspaceId) {
            quota {
              used
            }
          }
        }
      }
    `,
    { workspaceId: id }
  );
  const sessionId = await createCopilotSession(
    app,
    id,
    randomUUID(),
    'slides.outline'
  );
  const messageId = await createCopilotMessage(app, sessionId, 'apple company');
  const actionPrompt = await prompt.get('slides.outline');
  t.truthy(actionPrompt);
  const ret = await chatWithActionStream(app, sessionId, {
    actionId: 'slides.outline',
    actionVersion: 'v1',
    modelId: actionPrompt?.model,
    messageId,
  });
  t.is(
    array2sse(sse2array(ret).filter(e => e.event !== 'event')),
    textToEventStream(['generate text to text stream'], messageId),
    'should be able to chat with action stream'
  );
  const actionRuns = await db.aiActionRun.findMany({
    where: { sessionId },
    select: {
      actionId: true,
      actionVersion: true,
      status: true,
      assistantMessageId: true,
    },
  });
  const afterQuota = await app.gql(
    `
      query getCopilotQuota($workspaceId: String!) {
        currentUser {
          copilot(workspaceId: $workspaceId) {
            quota {
              used
            }
          }
        }
      }
    `,
    { workspaceId: id }
  );

  t.like(actionRuns[0], {
    actionId: 'slides.outline',
    actionVersion: 'v1',
    status: 'succeeded',
  });
  t.truthy(actionRuns[0]?.assistantMessageId);
  t.is(
    afterQuota.currentUser.copilot.quota.used,
    beforeQuota.currentUser.copilot.quota.used + 1
  );
});

test('should map action stream preparation errors to SSE error events', async t => {
  const { app } = t.context;

  const { id } = await createWorkspace(app);
  const sessionId = await createCopilotSession(
    app,
    id,
    randomUUID(),
    'slides.outline'
  );
  const messageId = await createCopilotMessage(app, sessionId, 'apple company');

  const ret = await chatWithActionStream(app, sessionId, {
    actionId: 'image.filter.unknown',
    actionVersion: 'v1',
    messageId,
  });

  t.true(ret.includes('error'));
});

test('should be able to chat with special image model', async t => {
  const { app, prompt, storage } = t.context;

  Sinon.stub(storage, 'handleRemoteLink').resolvesArg(2);

  const { id } = await createWorkspace(app);

  const testWithModel = async (promptName: string, finalPrompt: string) => {
    const model = (await prompt.get(promptName))?.model;
    const sessionId = await createCopilotSession(
      app,
      id,
      randomUUID(),
      promptName
    );
    const messageId = await createCopilotMessage(app, sessionId, 'some-tag', [
      `https://example.com/${promptName}.jpg`,
    ]);
    const ret3 = await chatWithImages(app, sessionId, messageId);
    t.is(
      ret3,
      textToEventStream(
        [
          `https://example.com/${model}.jpg`,
          `https://example.com/generated/${encodeURIComponent(finalPrompt)}.jpg`,
        ],
        messageId,
        'attachment'
      ),
      'should be able to chat with images'
    );
  };

  await testWithModel('Generate image', 'some-tag');
  await testWithModel(
    'Convert to sticker',
    'convert this image to sticker. you need to identify the subject matter and warp a circle of white stroke around the subject matter and with transparent background. some-tag'
  );
  await testWithModel(
    'Upscale image',
    'make the image more detailed. some-tag'
  );
  await testWithModel(
    'Remove background',
    'Keep the subject and remove other non-subject items. Transparent background. some-tag'
  );

  Sinon.restore();
});

test('should be able to retry with api', async t => {
  const { app, storage } = t.context;

  Sinon.stub(storage, 'handleRemoteLink').resolvesArg(2);

  // normal chat
  {
    const { id } = await createWorkspace(app);
    const docId = randomUUID();
    const sessionId = await createCopilotSession(
      app,
      id,
      docId,
      textPromptName
    );
    const messageId = await createCopilotMessage(app, sessionId);
    // chat 2 times
    await chatWithText(app, sessionId, messageId);
    await chatWithText(app, sessionId, messageId);

    const histories = await getHistories(app, { workspaceId: id, docId });
    t.deepEqual(
      histories.map(h => h.messages.map(m => m.content)),
      [['generate text to text stream', 'generate text to text stream']],
      'should be able to list history'
    );
  }

  // retry chat
  {
    const { id } = await createWorkspace(app);
    const docId = randomUUID();
    const sessionId = await createCopilotSession(
      app,
      id,
      docId,
      textPromptName
    );
    const messageId = await createCopilotMessage(app, sessionId);
    await chatWithText(app, sessionId, messageId);
    // retry without message id
    await chatWithText(app, sessionId);

    // should only have 1 message
    const histories = await getHistories(app, { workspaceId: id, docId });
    t.snapshot(
      cleanObject(histories),
      'should be able to list history after retry'
    );
  }

  // retry chat with new message id
  {
    const { id } = await createWorkspace(app);
    const docId = randomUUID();
    const sessionId = await createCopilotSession(
      app,
      id,
      docId,
      textPromptName
    );
    const messageId = await createCopilotMessage(app, sessionId);
    await chatWithText(app, sessionId, messageId);
    // retry with new message id
    const newMessageId = await createCopilotMessage(app, sessionId);
    await chatWithText(app, sessionId, newMessageId, '', true);

    // should only have 1 message
    const histories = await getHistories(app, { workspaceId: id, docId });
    t.snapshot(
      cleanObject(histories),
      'should be able to list history after retry'
    );
  }

  Sinon.restore();
});

test('should reject message from different session', async t => {
  const { app } = t.context;

  const { id } = await createWorkspace(app);
  const sessionId = await createCopilotSession(
    app,
    id,
    randomUUID(),
    textPromptName
  );
  const anotherSessionId = await createCopilotSession(
    app,
    id,
    randomUUID(),
    textPromptName
  );
  const anotherMessageId = await createCopilotMessage(app, anotherSessionId);
  await t.throwsAsync(
    chatWithText(app, sessionId, anotherMessageId),
    { instanceOf: Error },
    'should reject message from different session'
  );
});

test('should reject request from different user', async t => {
  const { app, u1 } = t.context;

  const u2 = await app.createUser();
  const { id } = await createWorkspace(app);
  const sessionId = await createCopilotSession(
    app,
    id,
    randomUUID(),
    textPromptName
  );

  // should reject message from different user
  {
    await app.login(u2);
    await t.throwsAsync(
      createCopilotMessage(app, sessionId),
      { instanceOf: Error },
      'should reject message from different user'
    );
  }

  // should reject chat from different user
  {
    await app.switchUser(u1);
    const messageId = await createCopilotMessage(app, sessionId);
    {
      await app.switchUser(u2);
      await t.throwsAsync(
        chatWithText(app, sessionId, messageId),
        { instanceOf: Error },
        'should reject chat from different user'
      );
    }
  }
});

// ==================== history ====================

test('should be able to list history', async t => {
  const { app } = t.context;

  const { id: workspaceId } = await createWorkspace(app);
  const docId = randomUUID();
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    docId,
    textPromptName
  );

  const messageId = await createCopilotMessage(app, sessionId, 'hello');
  await chatWithText(app, sessionId, messageId);

  {
    const histories = await getHistories(app, { workspaceId, docId });
    t.deepEqual(
      histories.map(h => h.messages.map(m => m.content)),
      [['hello', 'generate text to text stream']],
      'should be able to list history'
    );
  }

  {
    const histories = await getHistories(app, {
      workspaceId,
      docId,
      options: { messageOrder: 'desc' },
    });
    t.deepEqual(
      histories.map(h => h.messages.map(m => m.content)),
      [['generate text to text stream', 'hello']],
      'should be able to list history'
    );
  }
});

test('should preserve persisted assistant render trace on history reload', async t => {
  const { app } = t.context;
  const chatRuntime = app.get(CapabilityRuntime);
  Sinon.stub(chatRuntime, 'streamObject').callsFake(async function* () {
    yield { type: 'reasoning', textDelta: 'Inspecting context' } as const;
    yield {
      type: 'tool-result',
      toolCallId: 'call_1',
      toolName: 'doc_read',
      args: { docId: 'doc-1' },
      result: { markdown: '# AFFiNE' },
    } as const;
    yield { type: 'text-delta', textDelta: 'Final ' } as const;
    yield { type: 'text-delta', textDelta: 'answer' } as const;
  });

  const { id: workspaceId } = await createWorkspace(app);
  const docId = randomUUID();
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    docId,
    textPromptName
  );

  const messageToken = await createCopilotMessage(app, sessionId, 'hello');
  await chatWithStreamObject(app, sessionId, messageToken);

  const histories = await app.gql(
    `
      query getCopilotHistoriesWithTrace(
        $workspaceId: String!
        $docId: String
        $options: QueryChatHistoriesInput
      ) {
        currentUser {
          copilot(workspaceId: $workspaceId) {
            histories(docId: $docId, options: $options) {
              sessionId
              messages {
                role
                content
                streamObjects {
                  type
                  textDelta
                  toolCallId
                  toolName
                  args
                  result
                }
              }
            }
          }
        }
      }
    `,
    {
      workspaceId,
      docId,
      options: { withMessages: true },
    }
  );

  const assistantMessage =
    histories.currentUser.copilot.histories[0]?.messages.find(
      (message: { role: string }) => message.role === 'assistant'
    );

  t.is(assistantMessage?.content, 'Final answer');
  t.deepEqual(assistantMessage?.streamObjects, [
    {
      type: 'reasoning',
      textDelta: 'Inspecting context',
      toolCallId: null,
      toolName: null,
      args: null,
      result: null,
    },
    {
      type: 'tool-result',
      toolCallId: 'call_1',
      toolName: 'doc_read',
      args: { docId: 'doc-1' },
      result: { markdown: '# AFFiNE' },
      textDelta: null,
    },
    {
      type: 'text-delta',
      textDelta: 'Final answer',
      toolCallId: null,
      toolName: null,
      args: null,
      result: null,
    },
  ]);
});

test('should keep compat submission token out of durable history before stream', async t => {
  const { app } = t.context;

  const { id: workspaceId } = await createWorkspace(app);
  const docId = randomUUID();
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    docId,
    textPromptName
  );

  const messageToken = await createCopilotMessage(app, sessionId, 'hello');
  const histories = await getHistories(app, { workspaceId, docId });

  t.deepEqual(
    histories.flatMap(history =>
      history.messages.map(message => message.content)
    ),
    [],
    'should not persist user turn before stream starts'
  );

  await chatWithText(app, sessionId, messageToken);
  const [history] = await getHistories(app, { workspaceId, docId });

  t.truthy(history?.messages[0]?.id);
  t.not(
    history?.messages[0]?.id,
    messageToken,
    'should return compat token instead of durable turn id'
  );
});

test('should accept compat submission once and keep duplicate consume idempotent', async t => {
  const { app } = t.context;

  const { id: workspaceId } = await createWorkspace(app);
  const docId = randomUUID();
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    docId,
    textPromptName
  );

  const beforeQuota = await app.gql(
    `
      query getCopilotQuota($workspaceId: String!) {
        currentUser {
          copilot(workspaceId: $workspaceId) {
            quota {
              used
            }
          }
        }
      }
    `,
    { workspaceId }
  );

  const messageToken = await createCopilotMessage(app, sessionId, 'hello');
  const text = await chatWithText(app, sessionId, messageToken);
  t.is(text, 'generate text to text stream');
  await chatWithText(app, sessionId, messageToken);

  const afterQuota = await app.gql(
    `
      query getCopilotQuota($workspaceId: String!) {
        currentUser {
          copilot(workspaceId: $workspaceId) {
            quota {
              used
            }
          }
        }
      }
    `,
    { workspaceId }
  );
  const [history] = await getHistories(app, { workspaceId, docId });

  t.is(
    afterQuota.currentUser.copilot.quota.used,
    beforeQuota.currentUser.copilot.quota.used + 1,
    'should count accepted submission exactly once'
  );
  t.true((history?.tokens ?? 0) > 0, 'should accumulate token cost');
  t.deepEqual(
    history?.messages.map(message => message.content),
    ['hello', 'generate text to text stream', 'generate text to text stream']
  );
  t.is(
    history?.messages.filter(message => message.role === 'user').length,
    1,
    'should reuse the same durable user turn for duplicate consume'
  );
  t.not(
    history?.messages.find(message => message.role === 'user')?.id,
    messageToken,
    'should keep compat token separate from durable user turn id'
  );
});

test('should allow accepted token replay after quota is exhausted', async t => {
  const { app } = t.context;
  const quota = app.get(QuotaService);
  Sinon.stub(quota, 'getUserQuota').resolves({
    copilotActionLimit: 1,
  } as never);

  const { id: workspaceId } = await createWorkspace(app);
  const docId = randomUUID();
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    docId,
    textPromptName
  );

  const messageToken = await createCopilotMessage(app, sessionId, 'hello');
  t.is(
    await chatWithText(app, sessionId, messageToken),
    'generate text to text stream'
  );
  t.is(
    await chatWithText(app, sessionId, messageToken),
    'generate text to text stream'
  );

  const [history] = await getHistories(app, { workspaceId, docId });
  t.is(
    history?.messages.filter(message => message.role === 'user').length,
    1,
    'should not insert a second user turn when replaying an accepted token'
  );
});

test('should recover duplicate consume after accepted-cache write fails', async t => {
  const { app } = t.context;
  const submissions = app.get(CompatSubmissionStore);
  let shouldFail = true;
  Sinon.stub(submissions, 'markAccepted').callsFake(async (...args) => {
    if (shouldFail) {
      shouldFail = false;
      throw new Error('inject accepted cache failure');
    }
    return await CompatSubmissionStore.prototype.markAccepted.apply(
      submissions,
      args
    );
  });

  const { id: workspaceId } = await createWorkspace(app);
  const docId = randomUUID();
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    docId,
    textPromptName
  );

  const messageToken = await createCopilotMessage(app, sessionId, 'hello');
  await t.throwsAsync(chatWithText(app, sessionId, messageToken), {
    instanceOf: Error,
  });

  t.is(
    await chatWithText(app, sessionId, messageToken),
    'generate text to text stream'
  );

  const [history] = await getHistories(app, { workspaceId, docId });
  t.is(
    history?.messages.filter(message => message.role === 'user').length,
    1,
    'should reuse the durable user turn after accepted-cache failure'
  );
  t.deepEqual(
    history?.messages.map(message => message.content),
    ['hello', 'generate text to text stream']
  );
});

test('should retry token safely when durable insert failed before commit', async t => {
  const { app } = t.context;
  const sessions = app.get(ChatSessionService);
  let shouldFail = true;
  Sinon.stub(sessions, 'appendTurn').callsFake(async (...args) => {
    if (shouldFail) {
      shouldFail = false;
      throw new Error('inject append failure');
    }
    return await ChatSessionService.prototype.appendTurn.apply(sessions, args);
  });

  const { id: workspaceId } = await createWorkspace(app);
  const docId = randomUUID();
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    docId,
    textPromptName
  );

  const messageToken = await createCopilotMessage(app, sessionId, 'hello');
  await t.throwsAsync(chatWithText(app, sessionId, messageToken), {
    instanceOf: Error,
  });

  t.is(
    await chatWithText(app, sessionId, messageToken),
    'generate text to text stream'
  );

  const [history] = await getHistories(app, { workspaceId, docId });
  t.is(
    history?.messages.filter(message => message.role === 'user').length,
    1,
    'should insert the user turn exactly once after retry'
  );
  t.deepEqual(
    history?.messages.map(message => message.content),
    ['hello', 'generate text to text stream']
  );
});

test('should reject new token before durable insert when quota is exhausted', async t => {
  const { app } = t.context;
  const quota = app.get(QuotaService);
  Sinon.stub(quota, 'getUserQuota').resolves({
    copilotActionLimit: 1,
  } as never);

  const { id: workspaceId } = await createWorkspace(app);
  const docId = randomUUID();
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    docId,
    textPromptName
  );

  const firstMessageToken = await createCopilotMessage(app, sessionId, 'hello');
  await chatWithText(app, sessionId, firstMessageToken);

  const secondMessageToken = await createCopilotMessage(
    app,
    sessionId,
    'new action'
  );
  await t.throwsAsync(chatWithText(app, sessionId, secondMessageToken), {
    instanceOf: Error,
  });

  const [history] = await getHistories(app, { workspaceId, docId });
  t.deepEqual(
    history?.messages.map(message => message.content),
    ['hello', 'generate text to text stream']
  );
});

test('should preload prompt messages when withPrompt is enabled', async t => {
  const { app, prompt } = t.context;

  const promptName = randomUUID().replaceAll('-', '');
  await prompt.set(promptName, 'test', [
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: 'preloaded question' },
  ]);

  const { id: workspaceId } = await createWorkspace(app);
  const docId = randomUUID();
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    docId,
    promptName
  );
  const messageId = await createCopilotMessage(app, sessionId, 'hello');
  await chatWithText(app, sessionId, messageId);

  const withoutPrompt = await getHistories(app, {
    workspaceId,
    docId,
    options: { withPrompt: false },
  });
  const withPrompt = await getHistories(app, {
    workspaceId,
    docId,
    options: { withPrompt: true },
  });
  const chatsWithPrompt = await app.gql(
    `
      query getCopilotChatsWithPrompt(
        $workspaceId: String!
        $docId: String!
        $pagination: PaginationInput!
        $options: QueryChatHistoriesInput
      ) {
        currentUser {
          copilot(workspaceId: $workspaceId) {
            chats(pagination: $pagination, docId: $docId, options: $options) {
              totalCount
              edges {
                node {
                  sessionId
                  messages {
                    content
                  }
                }
              }
            }
          }
        }
      }
    `,
    {
      workspaceId,
      docId,
      pagination: { first: 10, offset: 0 },
      options: { withMessages: true, withPrompt: true },
    }
  );

  t.deepEqual(
    withoutPrompt[0]?.messages.map(message => message.content),
    ['hello', 'generate text to text stream']
  );
  t.deepEqual(
    withPrompt[0]?.messages.map(message => message.content),
    ['preloaded question', 'hello', 'generate text to text stream']
  );
  t.deepEqual(
    chatsWithPrompt.currentUser.copilot.chats.edges[0]?.node.messages.map(
      (message: { content: string }) => message.content
    ),
    ['preloaded question', 'hello', 'generate text to text stream']
  );
});

test('should keep action sessions visible in session and chat metadata queries', async t => {
  const { app } = t.context;

  const { id: workspaceId } = await createWorkspace(app);
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    randomUUID(),
    'Generate image'
  );

  const sessionsResult = await app.gql(
    `
      query getCopilotSessions($workspaceId: String!) {
        currentUser {
          copilot(workspaceId: $workspaceId) {
            sessions {
              id
              promptName
            }
          }
        }
      }
    `,
    { workspaceId }
  );
  const chatsResult = await app.gql(
    `
      query getCopilotChats($workspaceId: String!, $pagination: PaginationInput!) {
        currentUser {
          copilot(workspaceId: $workspaceId) {
            chats(pagination: $pagination) {
              edges {
                node {
                  sessionId
                  promptName
                  action
                  messages {
                    content
                  }
                }
              }
            }
          }
        }
      }
    `,
    {
      workspaceId,
      pagination: { first: 10, offset: 0 },
    }
  );

  t.true(
    sessionsResult.currentUser.copilot.sessions.some(
      (session: { id: string; promptName: string }) =>
        session.id === sessionId && session.promptName === 'Generate image'
    ),
    'should expose action session in sessions()'
  );
  t.true(
    chatsResult.currentUser.copilot.chats.edges.some(
      (edge: {
        node: {
          sessionId: string;
          promptName: string;
          messages: { content: string }[];
        };
      }) =>
        edge.node.sessionId === sessionId &&
        edge.node.promptName === 'Generate image' &&
        edge.node.messages.length === 0
    ),
    'should expose action session metadata in chats(withMessages: false)'
  );
});

test('should reject request that user have not permission', async t => {
  const { app, u1 } = t.context;

  const u2 = await app.createUser();
  const { id: workspaceId } = await createWorkspace(app);

  // should reject request that user have not permission
  {
    await app.login(u2);
    await t.throwsAsync(
      getHistories(app, { workspaceId }),
      { instanceOf: Error },
      'should reject request that user have not permission'
    );
  }

  // should able to list history after user have permission
  {
    await app.switchUser(u1);
    const inviteId = await inviteUser(app, workspaceId, u2.email);
    await app.switchUser(u2);
    await acceptInviteById(app, workspaceId, inviteId, false);

    t.deepEqual(
      await getHistories(app, { workspaceId }),
      [],
      'should able to list history after user have permission'
    );
  }

  {
    const docId = randomUUID();
    const sessionId = await createCopilotSession(
      app,
      workspaceId,
      docId,
      textPromptName
    );

    const messageId = await createCopilotMessage(app, sessionId);
    await chatWithText(app, sessionId, messageId);

    const histories = await getHistories(app, { workspaceId, docId });
    t.deepEqual(
      histories.map(h => h.messages.map(m => m.content)),
      [['generate text to text stream']],
      'should able to list history'
    );

    await app.switchUser(u1);
    t.deepEqual(
      await getHistories(app, { workspaceId }),
      [],
      'should not list history created by another user'
    );
  }
});

test('should be able to search image from unsplash', async t => {
  const { app } = t.context;

  const resp = await unsplashSearch(app);
  t.not(resp.status, 404, 'route should be exists');
});

test('should be able to manage context', async t => {
  const { app, context, jobs } = t.context;
  const waitForMatches = async <T>(
    loader: () => Promise<T[] | undefined>,
    expectedLength = 1
  ) => {
    let matches = await loader();
    for (let attempt = 0; attempt < 30; attempt++) {
      if ((matches?.length ?? 0) >= expectedLength) {
        return matches;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      matches = await loader();
    }
    return matches;
  };

  const { id: workspaceId } = await createWorkspace(app);
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    randomUUID(),
    textPromptName
  );

  // use mocked embedding client
  Sinon.stub(context, 'embeddingClient').get(() => new MockEmbeddingClient());
  Sinon.stub(jobs, 'embeddingClient').get(() => new MockEmbeddingClient());

  {
    await t.throwsAsync(
      createCopilotContext(app, workspaceId, randomUUID()),
      { instanceOf: Error },
      'should throw error if create context with invalid session id'
    );

    const context = await createCopilotContext(app, workspaceId, sessionId);

    const list = await listContext(app, workspaceId, sessionId);
    t.deepEqual(
      list.map(f => ({ id: f.id })),
      [{ id: context }],
      'should list context'
    );
  }

  const fs = await import('node:fs');
  const buffer = fs.readFileSync(
    ProjectRoot.join('packages/common/native/fixtures/sample.pdf').toFileUrl()
  );

  // match files
  {
    const contextId = await createCopilotContext(app, workspaceId, sessionId);

    const { id: fileId } = await addContextFile(
      app,
      contextId,
      'sample.pdf',
      buffer
    );

    const { files } =
      (await listContextDocAndFiles(app, workspaceId, sessionId, contextId)) ||
      {};
    t.snapshot(
      cleanObject(files, ['id', 'error', 'createdAt']),
      'should list context files'
    );

    // wait for processing
    await waitForStatus(
      async () =>
        (await listContextDocAndFiles(app, workspaceId, sessionId, contextId))
          ?.files?.[0]?.status,
      'finished',
      'context file embedding',
      60
    );

    const result = await waitForMatches(
      () => matchFiles(app, contextId, 'test', 1),
      1
    );
    if (!result) {
      t.fail('should return context matches');
      return;
    }
    t.is(result.length, 1, 'should match context');
    t.is(result[0].fileId, fileId, 'should match file id');
  }

  // match docs
  {
    const sessionId = await createCopilotSession(
      app,
      workspaceId,
      randomUUID(),
      textPromptName
    );
    const contextId = await createCopilotContext(app, workspaceId, sessionId);

    const docId = 'docId1';
    await t.context.db.snapshot.create({
      data: {
        workspaceId: workspaceId,
        id: docId,
        blob: Buffer.from([1, 1]),
        state: Buffer.from([1, 1]),
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    });

    await addContextDoc(app, contextId, docId);

    const { docs } =
      (await listContextDocAndFiles(app, workspaceId, sessionId, contextId)) ||
      {};
    t.snapshot(
      cleanObject(docs, ['error', 'createdAt']),
      'should list context docs'
    );

    // wait for processing
    await waitForStatus(
      async () =>
        (await listContextDocAndFiles(app, workspaceId, sessionId, contextId))
          ?.docs?.[0]?.status ?? undefined,
      'finished',
      'context doc embedding',
      60
    );

    const result = await waitForMatches(
      () => matchWorkspaceDocs(app, contextId, 'test', 1),
      1
    );
    if (!result) {
      t.fail('should return workspace doc matches');
      return;
    }
    t.is(result.length, 1, 'should match context');
    t.is(result[0].docId, docId, 'should match doc id');
  }
});

test('should reject context reads from another user', async t => {
  const { app, context, jobs, u1 } = t.context;

  const u2 = await app.signupV1();
  await app.switchUser(u1);

  const { id: workspaceId } = await createWorkspace(app);
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    randomUUID(),
    textPromptName
  );

  Sinon.stub(context, 'embeddingClient').get(() => new MockEmbeddingClient());
  Sinon.stub(jobs, 'embeddingClient').get(() => new MockEmbeddingClient());

  const contextId = await createCopilotContext(app, workspaceId, sessionId);
  await addContextFile(app, contextId, 'sample.txt', Buffer.from('test file'));

  await app.switchUser(u2);

  await t.throwsAsync(
    app.gql(`
      query {
        currentUser {
          copilot {
            contexts(contextId: "${contextId}") {
              id
            }
          }
        }
      }
    `)
  );
  await t.throwsAsync(matchFiles(app, contextId, 'test', 1));
});

test('should skip unauthorized docs when adding context category', async t => {
  const { app, context, jobs, u1 } = t.context;

  const member = await app.signupV1();
  await app.switchUser(u1);

  const { id: workspaceId } = await createWorkspace(app);
  await app.create(Mockers.WorkspaceUser, {
    workspaceId,
    userId: member.id,
    type: WorkspaceRole.Collaborator,
  });

  const readableSnapshot = await app.create(Mockers.DocSnapshot, {
    workspaceId,
    user: u1,
  });
  const hiddenSnapshot = await app.create(Mockers.DocSnapshot, {
    workspaceId,
    user: u1,
  });

  await app.create(Mockers.DocMeta, {
    workspaceId,
    docId: readableSnapshot.id,
    title: 'readable-doc',
  });
  await app.create(Mockers.DocMeta, {
    workspaceId,
    docId: hiddenSnapshot.id,
    title: 'hidden-doc',
    defaultRole: DocRole.None,
  });

  Sinon.stub(context, 'embeddingClient').get(() => new MockEmbeddingClient());
  Sinon.stub(jobs, 'embeddingClient').get(() => new MockEmbeddingClient());

  await app.switchUser(member);
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    randomUUID(),
    textPromptName
  );
  const contextId = await createCopilotContext(app, workspaceId, sessionId);
  const category = await addContextCategory(
    app,
    contextId,
    ContextCategories.Collection,
    'fav',
    [readableSnapshot.id, hiddenSnapshot.id]
  );

  t.deepEqual(
    category.docs.map(doc => doc.id),
    [readableSnapshot.id]
  );

  const ret = await listContextCategories(
    app,
    workspaceId,
    sessionId,
    contextId
  );
  t.deepEqual(
    ret?.collections?.[0]?.docs.map(doc => doc.id),
    [readableSnapshot.id]
  );
});

test('should be able to transcript', async t => {
  const { app, db } = t.context;

  const { id: workspaceId } = await createWorkspace(app);
  const transcriptOutput = [
    { a: 'A', s: 30, e: 45, t: 'Hello, everyone.' },
    {
      a: 'B',
      s: 46,
      e: 70,
      t: 'Hi, thank you for joining the meeting today.',
    },
  ];
  const summaryOutput = {
    title: 'Weekly Sync',
    durationMinutes: 12,
    attendees: ['A', 'B'],
    keyPoints: ['Reviewed launch status'],
    actionItems: [
      {
        description: 'Send recap',
        owner: 'A',
        deadline: 'Friday',
      },
    ],
    decisions: ['Ship on Monday'],
    openQuestions: ['Need final QA sign-off'],
    blockers: ['Waiting on analytics'],
  };
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return [hours, minutes, secs]
      .map(value => value.toString().padStart(2, '0'))
      .join(':');
  };
  const buildTranscriptActionResult = (
    route: {
      provider_id?: string;
      request?: {
        messages?: Array<{ content?: string | Array<{ text?: string }> }>;
      };
    },
    model: string,
    metadataFallback: {
      sourceAudio?: unknown;
      quality?: unknown;
      infos?: unknown;
      sliceManifest?: Array<{ startSec?: number }> | null;
    } = {}
  ) => {
    const getContentText = (content?: string | Array<{ text?: string }>) =>
      typeof content === 'string'
        ? content
        : content?.map(item => item.text ?? '').join('');
    const metadataContent = route.request?.messages
      ?.map(message => getContentText(message.content))
      .find(content => content?.startsWith('{'));
    const metadata = {
      ...metadataFallback,
      ...(metadataContent ? JSON.parse(metadataContent) : {}),
    };
    const sliceManifest: Array<{ startSec?: number }> = metadata.sliceManifest
      ?.length
      ? metadata.sliceManifest
      : [{ startSec: 0 }];
    const normalizedSegments = sliceManifest.flatMap(
      (slice: { startSec?: number }) =>
        transcriptOutput.map(segment => {
          const startSec = (slice.startSec ?? 0) + segment.s;
          const endSec = (slice.startSec ?? 0) + segment.e;
          const speaker = segment.a;
          return {
            speaker,
            start: formatTime(startSec),
            end: formatTime(endSec),
            startSec,
            endSec,
            text: segment.t,
          };
        })
    );
    return {
      sourceAudio: metadata.sourceAudio ?? null,
      quality: metadata.quality ?? null,
      infos: metadata.infos ?? null,
      sliceManifest: metadata.sliceManifest ?? null,
      normalizedSegments,
      normalizedTranscript: normalizedSegments
        .map(segment => `${segment.start} ${segment.speaker}: ${segment.text}`)
        .join('\n'),
      summaryJson: summaryOutput,
      providerMeta: {
        provider: 'gemini',
        model,
      },
    };
  };
  const originalActionPreparedStream = (serverNativeModule as any)
    .runNativeActionRecipePreparedStream;
  (serverNativeModule as any).runNativeActionRecipePreparedStream = (
    input: {
      recipeId: string;
      recipeVersion?: string;
      input?: {
        sourceAudio?: unknown;
        quality?: unknown;
        infos?: unknown;
        sliceManifest?: Array<{ startSec?: number }> | null;
        preparedRoutes?: {
          transcribe?: Array<{
            provider_id?: string;
            request?: {
              messages?: Array<{
                content?: string | Array<{ text?: string }>;
              }>;
            };
          }>;
        };
      };
    },
    callback: (error: Error | null, eventJson: string) => void
  ) => {
    if (!input.recipeId.startsWith('transcript.audio.')) {
      return originalActionPreparedStream(input, callback);
    }

    const route = input.input?.preparedRoutes?.transcribe?.[0] ?? {};
    const result = buildTranscriptActionResult(
      route,
      'gemini-2.5-flash',
      input.input ?? {}
    );
    const actionVersion = input.recipeVersion ?? 'v1';
    const events = [
      {
        type: 'action_start',
        actionId: input.recipeId,
        actionVersion,
        status: 'running',
      },
      {
        type: 'step_start',
        actionId: input.recipeId,
        actionVersion,
        stepId: 'transcribe',
        status: 'running',
      },
      {
        type: 'step_end',
        actionId: input.recipeId,
        actionVersion,
        stepId: 'transcribe',
        status: 'running',
      },
      {
        type: 'action_done',
        actionId: input.recipeId,
        actionVersion,
        status: 'succeeded',
        result,
        trace: {
          actionId: input.recipeId,
          actionVersion,
          status: 'succeeded',
          lightweight: [
            { type: 'action_start', status: 'running' },
            { type: 'action_trace', status: 'succeeded' },
          ],
        },
      },
    ];
    for (const event of events) {
      callback(null, JSON.stringify(event));
    }
    callback(null, '__AFFINE_LLM_STREAM_END__');
    return { abort() {} };
  };
  t.teardown(() => {
    (serverNativeModule as any).runNativeActionRecipePreparedStream =
      originalActionPreparedStream;
  });

  {
    const job = await submitTranscriptTask(
      app,
      workspaceId,
      '1',
      '1.mp3',
      [Buffer.from([1, 1])],
      {
        sourceAudio: {
          mimeType: 'audio/ogg',
          durationMs: 120000,
          sampleRate: 48000,
          channels: 2,
        },
        quality: {
          degraded: true,
          overflowCount: 4,
        },
        sliceManifest: [
          {
            index: 0,
            fileName: '1-0.opus',
            mimeType: 'audio/opus',
            startSec: 12,
            durationSec: 58,
            byteSize: 2,
          },
        ],
      }
    );
    t.truthy(job.id, 'should have job id');

    await waitForStatus(
      async () => {
        const status = (await getTranscriptTask(app, workspaceId, job.id))
          ?.status;
        if (status === 'failed') {
          const task = await db.aiTranscriptTask.findUnique({
            where: { id: job.id },
            select: { errorCode: true },
          });
          throw new Error(
            `audio transcription job failed: ${
              task?.errorCode ?? 'unknown error'
            }`
          );
        }
        return status;
      },
      'finished',
      'audio transcription job'
    );

    const result = await settleTranscriptTask(app, workspaceId, job.id);
    t.is(result.summaryJson?.title, 'Weekly Sync');
    t.is(result.summaryJson?.actionItems[0]?.description, 'Send recap');
    t.is(result.sourceAudio?.blobId, '1');
    t.is(result.sourceAudio?.mimeType, 'audio/ogg');
    t.is(result.quality?.degraded, true);
    t.is(result.quality?.overflowCount, 4);
    t.is(result.normalizedSegments?.[0]?.start, '00:00:42');
    t.is(result.normalizedSegments?.[0]?.text, 'Hello, everyone.');
    t.true(
      result.summaryJson?.keyPoints.includes('Reviewed launch status') ?? false
    );
  }

  {
    const job = await submitTranscriptTask(
      app,
      workspaceId,
      '2',
      '2.mp3',
      [Buffer.from([1, 1]), Buffer.from([1, 2])],
      {
        sliceManifest: [
          {
            index: 0,
            fileName: '2-0.opus',
            mimeType: 'audio/opus',
            startSec: 0,
            durationSec: 600,
            byteSize: 2,
          },
          {
            index: 1,
            fileName: '2-1.opus',
            mimeType: 'audio/opus',
            startSec: 605,
            durationSec: 120,
            byteSize: 2,
          },
        ],
      }
    );
    t.truthy(job.id, 'should have job id');

    await waitForStatus(
      async () => {
        const status = (await getTranscriptTask(app, workspaceId, job.id))
          ?.status;
        if (status === 'failed') {
          const task = await db.aiTranscriptTask.findUnique({
            where: { id: job.id },
            select: { errorCode: true },
          });
          throw new Error(
            `audio transcription job failed: ${
              task?.errorCode ?? 'unknown error'
            }`
          );
        }
        return status;
      },
      'finished',
      'audio transcription job'
    );

    const result = await settleTranscriptTask(app, workspaceId, job.id);
    t.deepEqual(
      result.normalizedSegments?.map(segment => segment.start),
      ['00:00:30', '00:00:46', '00:10:35', '00:10:51']
    );
    t.is(
      result.normalizedTranscript?.split('\n')[2],
      '00:10:35 A: Hello, everyone.'
    );
  }
});

test('should create different session types and validate prompt constraints', async t => {
  const { app } = t.context;
  const { id: workspaceId } = await createWorkspace(app);

  const validateSession = async (
    description: string,
    workspaceId: string,
    createPromise: Promise<string>
  ) => {
    const sessionId = await createPromise;

    t.truthy(sessionId, description);
    t.snapshot(
      cleanObject(
        [await getCopilotSession(app, workspaceId, sessionId)],
        ['id', 'workspaceId', 'promptName']
      ),
      `should create session with ${description}`
    );
    return sessionId;
  };

  await validateSession(
    'should create workspace session with text prompt',
    workspaceId,
    createWorkspaceCopilotSession(app, workspaceId, textPromptName)
  );
  await validateSession(
    'should create pinned session with text prompt',
    workspaceId,
    createPinnedCopilotSession(app, workspaceId, 'pinned-doc', textPromptName)
  );
  await validateSession(
    'should create doc session with text prompt',
    workspaceId,
    createDocCopilotSession(app, workspaceId, 'normal-doc', textPromptName)
  );
});

test('should list histories for different session types correctly', async t => {
  const { app } = t.context;
  const { id: workspaceId } = await createWorkspace(app);
  const pinnedDocId = 'pinned-doc';
  const docId = 'normal-doc';

  // create sessions and add messages
  const [workspaceSessionId, pinnedSessionId, docSessionId] = await Promise.all(
    [
      createWorkspaceCopilotSession(app, workspaceId, textPromptName),
      createPinnedCopilotSession(app, workspaceId, pinnedDocId, textPromptName),
      createDocCopilotSession(app, workspaceId, docId, textPromptName),
    ]
  );

  await Promise.all([
    createCopilotMessage(app, workspaceSessionId, 'workspace message'),
    createCopilotMessage(app, pinnedSessionId, 'pinned message'),
    createCopilotMessage(app, docSessionId, 'doc message'),
  ]);

  const testHistoryQuery = async (
    queryFn: () => Promise<any[]>,
    opts: {
      sessionIds?: string[];
      sessionId?: string;
      pinned?: boolean;
      isEmpty?: boolean;
    },
    description: string
  ) => {
    const s = await queryFn();

    if (opts.isEmpty) {
      t.is(s.length, 0, `should return ${description}`);
      return;
    }

    if (opts.sessionIds) {
      t.is(s.length, opts.sessionIds.length, `should return ${description}`);
      const ids = s.map(h => h.sessionId).sort((a, b) => a.localeCompare(b));
      const expectedIds = opts.sessionIds.sort((a, b) => a.localeCompare(b));
      t.deepEqual(ids, expectedIds, `should return correct ${description}`);
    } else if (opts.sessionId) {
      t.is(s.length, 1, `should return ${description}`);
      t.is(
        s[0].sessionId,
        opts.sessionId,
        `should return correct ${description}`
      );
      if (opts.pinned !== undefined) {
        t.is(s[0].pinned, opts.pinned, `pinned status for ${description}`);
      }
    }
  };

  // test for getHistories
  await testHistoryQuery(
    () => getHistories(app, { workspaceId, docId: null }),
    { sessionId: workspaceSessionId },
    'workspace session history'
  );
  await testHistoryQuery(
    () => getHistories(app, { workspaceId, docId: pinnedDocId }),
    { sessionId: pinnedSessionId },
    'pinned session history'
  );
  await testHistoryQuery(
    () => getHistories(app, { workspaceId, docId }),
    { sessionId: docSessionId },
    'doc session history'
  );

  // test for getWorkspaceSessions
  await testHistoryQuery(
    () => getWorkspaceSessions(app, { workspaceId }),
    { sessionId: workspaceSessionId, pinned: false },
    'workspace-level sessions'
  );

  // test for getDocSessions
  await testHistoryQuery(
    () =>
      getDocSessions(app, { workspaceId, docId, options: { pinned: false } }),
    { sessionId: docSessionId, pinned: false },
    'doc sessions'
  );

  await testHistoryQuery(
    () => getDocSessions(app, { workspaceId, docId: pinnedDocId }),
    { sessionId: pinnedSessionId, pinned: true },
    'pinned doc sessions'
  );

  // test for getPinnedSessions
  await testHistoryQuery(
    () => getPinnedSessions(app, { workspaceId }),
    { sessionId: pinnedSessionId, pinned: true },
    'pinned sessions'
  );

  await testHistoryQuery(
    () => getPinnedSessions(app, { workspaceId, docId: pinnedDocId }),
    { sessionId: pinnedSessionId, pinned: true },
    'pinned session for specific doc'
  );

  await testHistoryQuery(
    () => getPinnedSessions(app, { workspaceId, docId }),
    { isEmpty: true },
    'no pinned sessions for non-pinned doc'
  );
});
