import { randomUUID } from 'node:crypto';

import { ProjectRoot } from '@affine-tools/utils/path';
import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';
import Sinon from 'sinon';

import { JobQueue } from '../base';
import { ConfigModule } from '../base/config';
import { AuthService } from '../core/auth';
import { DocReader } from '../core/doc';
import { WorkspaceModule } from '../core/workspaces';
import { CopilotModule } from '../plugins/copilot';
import {
  CopilotContextDocJob,
  CopilotContextService,
} from '../plugins/copilot/context';
import { MockEmbeddingClient } from '../plugins/copilot/context/embedding';
import { prompts, PromptService } from '../plugins/copilot/prompt';
import {
  CopilotProviderService,
  FalProvider,
  OpenAIProvider,
  PerplexityProvider,
  registerCopilotProvider,
  unregisterCopilotProvider,
} from '../plugins/copilot/providers';
import { CopilotStorage } from '../plugins/copilot/storage';
import {
  acceptInviteById,
  createTestingApp,
  createWorkspace,
  inviteUser,
  TestingApp,
  TestUser,
} from './utils';
import {
  addContextDoc,
  addContextFile,
  array2sse,
  chatWithImages,
  chatWithText,
  chatWithTextStream,
  chatWithWorkflow,
  cleanObject,
  createCopilotContext,
  createCopilotMessage,
  createCopilotSession,
  forkCopilotSession,
  getHistories,
  listContext,
  listContextDocAndFiles,
  matchFiles,
  matchWorkspaceDocs,
  MockCopilotTestProvider,
  sse2array,
  textToEventStream,
  unsplashSearch,
  updateCopilotSession,
} from './utils/copilot';

const test = ava as TestFn<{
  auth: AuthService;
  app: TestingApp;
  db: PrismaClient;
  context: CopilotContextService;
  jobs: CopilotContextDocJob;
  prompt: PromptService;
  provider: CopilotProviderService;
  storage: CopilotStorage;
  u1: TestUser;
}>;

test.before(async t => {
  const app = await createTestingApp({
    imports: [
      ConfigModule.forRoot({
        plugins: {
          copilot: {
            openai: {
              apiKey: '1',
            },
            fal: {
              apiKey: '1',
            },
            perplexity: {
              apiKey: '1',
            },
            unsplashKey: process.env.UNSPLASH_ACCESS_KEY || '1',
          },
        },
      }),
      WorkspaceModule,
      CopilotModule,
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
      });
    },
  });

  const auth = app.get(AuthService);
  const db = app.get(PrismaClient);
  const context = app.get(CopilotContextService);
  const prompt = app.get(PromptService);
  const storage = app.get(CopilotStorage);
  const jobs = app.get(CopilotContextDocJob);

  t.context.app = app;
  t.context.db = db;
  t.context.auth = auth;
  t.context.context = context;
  t.context.prompt = prompt;
  t.context.storage = storage;
  t.context.jobs = jobs;
});

const promptName = 'prompt';
test.beforeEach(async t => {
  Sinon.restore();
  const { app, prompt } = t.context;
  await app.initTestingDB();
  await prompt.onModuleInit();
  t.context.u1 = await app.signupV1('u1@affine.pro');

  unregisterCopilotProvider(OpenAIProvider.type);
  unregisterCopilotProvider(FalProvider.type);
  unregisterCopilotProvider(PerplexityProvider.type);
  registerCopilotProvider(MockCopilotTestProvider);

  await prompt.set(promptName, 'test', [
    { role: 'system', content: 'hello {{word}}' },
  ]);
});

test.after.always(async t => {
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
      createCopilotSession(app, workspaceId, randomUUID(), promptName)
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
    const u2 = await app.createUser('u2@affine.pro');
    const { id } = await createWorkspace(app);
    await app.login(u2);
    await assertCreateSession(id, '', async x => {
      await t.throwsAsync(
        x,
        { instanceOf: Error },
        'should not able to create session with cloud workspace that user cannot access'
      );
    });

    app.switchUser(u1);
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
    await asserter(updateCopilotSession(app, sessionId, promptName));
  };

  {
    const { id: workspaceId } = await createWorkspace(app);
    const docId = randomUUID();
    const sessionId = await createCopilotSession(
      app,
      workspaceId,
      docId,
      promptName
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
      promptName
    );
    await assertUpdateSession(
      sessionId,
      'should be able to update session with local workspace'
    );
  }

  {
    await app.signupV1('test@affine.pro');
    const u2 = await app.createUser('u2@affine.pro');
    const { id: workspaceId } = await createWorkspace(app);
    const inviteId = await inviteUser(app, workspaceId, u2.email);
    await app.login(u2);
    await acceptInviteById(app, workspaceId, inviteId, false);
    const sessionId = await createCopilotSession(
      app,
      workspaceId,
      randomUUID(),
      promptName
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

test('should fork session correctly', async t => {
  const { app, u1 } = t.context;

  const assertForkSession = async (
    workspaceId: string,
    sessionId: string,
    lastMessageId: string,
    error: string,
    asserter = async (x: any) => {
      const forkedSessionId = await x;
      t.truthy(forkedSessionId, error);
      return forkedSessionId;
    }
  ) =>
    await asserter(
      forkCopilotSession(
        app,
        workspaceId,
        randomUUID(),
        sessionId,
        lastMessageId
      )
    );

  // prepare session
  const { id } = await createWorkspace(app);
  const sessionId = await createCopilotSession(
    app,
    id,
    randomUUID(),
    promptName
  );

  let forkedSessionId: string;
  // should be able to fork session
  {
    for (let i = 0; i < 3; i++) {
      const messageId = await createCopilotMessage(app, sessionId);
      await chatWithText(app, sessionId, messageId);
    }
    const histories = await getHistories(app, { workspaceId: id });
    const latestMessageId = histories[0].messages.findLast(
      m => m.role === 'assistant'
    )?.id;
    t.truthy(latestMessageId, 'should find last message id');

    // should be able to fork session
    forkedSessionId = await assertForkSession(
      id,
      sessionId,
      latestMessageId!,
      'should be able to fork session with cloud workspace that user can access'
    );
  }

  {
    const u2 = await app.signupV1('u2@affine.pro');
    await assertForkSession(id, sessionId, randomUUID(), '', async x => {
      await t.throwsAsync(
        x,
        { instanceOf: Error },
        'should not able to fork session with cloud workspace that user cannot access'
      );
    });

    app.switchUser(u1);
    const inviteId = await inviteUser(app, id, u2.email);
    app.switchUser(u2);
    await acceptInviteById(app, id, inviteId, false);
    await assertForkSession(id, sessionId, randomUUID(), '', async x => {
      await t.throwsAsync(
        x,
        { instanceOf: Error },
        'should not able to fork a root session from other user'
      );
    });

    app.switchUser(u1);
    const histories = await getHistories(app, { workspaceId: id });
    const latestMessageId = histories
      .find(h => h.sessionId === forkedSessionId)
      ?.messages.findLast(m => m.role === 'assistant')?.id;
    t.truthy(latestMessageId, 'should find latest message id');

    app.switchUser(u2);
    await assertForkSession(
      id,
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
    await createCopilotSession(app, id, randomUUID(), promptName),
    'failed to create session'
  );
});

// ==================== message ====================

test('should create message correctly', async t => {
  const { app } = t.context;

  {
    const { id } = await createWorkspace(app);
    const sessionId = await createCopilotSession(
      app,
      id,
      randomUUID(),
      promptName
    );
    const messageId = await createCopilotMessage(app, sessionId);
    t.truthy(messageId, 'should be able to create message with valid session');
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
  const sessionId = await createCopilotSession(
    app,
    id,
    randomUUID(),
    promptName
  );
  const messageId = await createCopilotMessage(app, sessionId);
  const ret = await chatWithText(app, sessionId, messageId);
  t.is(ret, 'generate text to text', 'should be able to chat with text');

  const ret2 = await chatWithTextStream(app, sessionId, messageId);
  t.is(
    ret2,
    textToEventStream('generate text to text stream', messageId),
    'should be able to chat with text stream'
  );

  const ret3 = await chatWithImages(app, sessionId, messageId);
  t.is(
    array2sse(sse2array(ret3).filter(e => e.event !== 'event')),
    textToEventStream(
      ['https://example.com/test.jpg', 'hello '],
      messageId,
      'attachment'
    ),
    'should be able to chat with images'
  );

  Sinon.restore();
});

test('should be able to chat with api by workflow', async t => {
  const { app } = t.context;

  const { id } = await createWorkspace(app);
  const sessionId = await createCopilotSession(
    app,
    id,
    randomUUID(),
    'workflow:presentation'
  );
  const messageId = await createCopilotMessage(app, sessionId, 'apple company');
  const ret = await chatWithWorkflow(app, sessionId, messageId);
  t.is(
    array2sse(sse2array(ret).filter(e => e.event !== 'event')),
    textToEventStream(['generate text to text stream'], messageId),
    'should be able to chat with workflow'
  );
});

test('should be able to chat with special image model', async t => {
  const { app, storage } = t.context;

  Sinon.stub(storage, 'handleRemoteLink').resolvesArg(2);

  const { id } = await createWorkspace(app);

  const testWithModel = async (promptName: string, finalPrompt: string) => {
    const model = prompts.find(p => p.name === promptName)?.model;
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
        [`https://example.com/${model}.jpg`, finalPrompt],
        messageId,
        'attachment'
      ),
      'should be able to chat with images'
    );
  };

  await testWithModel('debug:action:fal-sd15', 'some-tag');
  await testWithModel(
    'debug:action:fal-upscaler',
    'best quality, 8K resolution, highres, clarity, some-tag'
  );
  await testWithModel('debug:action:fal-remove-bg', 'some-tag');

  Sinon.restore();
});

test('should be able to retry with api', async t => {
  const { app, storage } = t.context;

  Sinon.stub(storage, 'handleRemoteLink').resolvesArg(2);

  // normal chat
  {
    const { id } = await createWorkspace(app);
    const sessionId = await createCopilotSession(
      app,
      id,
      randomUUID(),
      promptName
    );
    const messageId = await createCopilotMessage(app, sessionId);
    // chat 2 times
    await chatWithText(app, sessionId, messageId);
    await chatWithText(app, sessionId, messageId);

    const histories = await getHistories(app, { workspaceId: id });
    t.deepEqual(
      histories.map(h => h.messages.map(m => m.content)),
      [['generate text to text', 'generate text to text']],
      'should be able to list history'
    );
  }

  // retry chat
  {
    const { id } = await createWorkspace(app);
    const sessionId = await createCopilotSession(
      app,
      id,
      randomUUID(),
      promptName
    );
    const messageId = await createCopilotMessage(app, sessionId);
    await chatWithText(app, sessionId, messageId);
    // retry without message id
    await chatWithText(app, sessionId);

    // should only have 1 message
    const histories = await getHistories(app, { workspaceId: id });
    t.snapshot(
      cleanObject(histories),
      'should be able to list history after retry'
    );
  }

  // retry chat with new message id
  {
    const { id } = await createWorkspace(app);
    const sessionId = await createCopilotSession(
      app,
      id,
      randomUUID(),
      promptName
    );
    const messageId = await createCopilotMessage(app, sessionId);
    await chatWithText(app, sessionId, messageId);
    // retry with new message id
    const newMessageId = await createCopilotMessage(app, sessionId);
    await chatWithText(app, sessionId, newMessageId, '', true);

    // should only have 1 message
    const histories = await getHistories(app, { workspaceId: id });
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
    promptName
  );
  const anotherSessionId = await createCopilotSession(
    app,
    id,
    randomUUID(),
    promptName
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

  const u2 = await app.createUser('u2@affine.pro');
  const { id } = await createWorkspace(app);
  const sessionId = await createCopilotSession(
    app,
    id,
    randomUUID(),
    promptName
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
    app.switchUser(u1);
    const messageId = await createCopilotMessage(app, sessionId);
    {
      app.switchUser(u2);
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
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    randomUUID(),
    promptName
  );

  const messageId = await createCopilotMessage(app, sessionId, 'hello');
  await chatWithText(app, sessionId, messageId);

  {
    const histories = await getHistories(app, { workspaceId });
    t.deepEqual(
      histories.map(h => h.messages.map(m => m.content)),
      [['hello', 'generate text to text']],
      'should be able to list history'
    );
  }

  {
    const histories = await getHistories(app, {
      workspaceId,
      options: { messageOrder: 'desc' },
    });
    t.deepEqual(
      histories.map(h => h.messages.map(m => m.content)),
      [['generate text to text', 'hello']],
      'should be able to list history'
    );
  }
});

test('should reject request that user have not permission', async t => {
  const { app, u1 } = t.context;

  const u2 = await app.createUser('u2@affine.pro');
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
    app.switchUser(u1);
    const inviteId = await inviteUser(app, workspaceId, u2.email);
    app.switchUser(u2);
    await acceptInviteById(app, workspaceId, inviteId, false);

    t.deepEqual(
      await getHistories(app, { workspaceId }),
      [],
      'should able to list history after user have permission'
    );
  }

  {
    const sessionId = await createCopilotSession(
      app,
      workspaceId,
      randomUUID(),
      promptName
    );

    const messageId = await createCopilotMessage(app, sessionId);
    await chatWithText(app, sessionId, messageId);

    const histories = await getHistories(app, { workspaceId });
    t.deepEqual(
      histories.map(h => h.messages.map(m => m.content)),
      [['generate text to text']],
      'should able to list history'
    );

    app.switchUser(u1);
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

  const { id: workspaceId } = await createWorkspace(app);
  const sessionId = await createCopilotSession(
    app,
    workspaceId,
    randomUUID(),
    promptName
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

    const context = createCopilotContext(app, workspaceId, sessionId);
    await t.notThrowsAsync(context, 'should create context with chat session');

    const list = await listContext(app, workspaceId, sessionId);
    t.deepEqual(
      list.map(f => ({ id: f.id })),
      [{ id: await context }],
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
      'fileId1',
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
    {
      let { files } =
        (await listContextDocAndFiles(
          app,
          workspaceId,
          sessionId,
          contextId
        )) || {};

      while (files?.[0].status !== 'finished') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        ({ files } =
          (await listContextDocAndFiles(
            app,
            workspaceId,
            sessionId,
            contextId
          )) || {});
      }
    }

    const result = (await matchFiles(app, contextId, 'test', 1))!;
    t.is(result.length, 1, 'should match context');
    t.is(result[0].fileId, fileId, 'should match file id');
  }

  // match docs
  {
    const sessionId = await createCopilotSession(
      app,
      workspaceId,
      randomUUID(),
      promptName
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
    {
      let { docs } =
        (await listContextDocAndFiles(
          app,
          workspaceId,
          sessionId,
          contextId
        )) || {};

      while (docs?.[0].status !== 'finished') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        ({ docs } =
          (await listContextDocAndFiles(
            app,
            workspaceId,
            sessionId,
            contextId
          )) || {});
      }
    }

    const result = (await matchWorkspaceDocs(app, contextId, 'test', 1))!;
    t.is(result.length, 1, 'should match context');
    t.is(result[0].docId, docId, 'should match doc id');
  }
});
