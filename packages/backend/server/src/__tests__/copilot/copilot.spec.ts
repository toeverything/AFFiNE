import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { ProjectRoot } from '@affine-tools/utils/path';
import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';
import { nanoid } from 'nanoid';
import Sinon from 'sinon';

import {
  EventBus,
  JobQueue,
  RequestMutex,
  SpaceAccessDenied,
} from '../../base';
import { ConfigModule } from '../../base/config';
import { AuthService } from '../../core/auth';
import { QuotaModule } from '../../core/quota';
import { QuotaStateService } from '../../core/quota/state';
import { StorageModule, WorkspaceBlobStorage } from '../../core/storage';
import {
  ContextCategories,
  CopilotSessionModel,
  Models,
  WorkspaceMemberStatus,
  WorkspaceModel,
  WorkspaceRole,
} from '../../models';
import { CopilotModule } from '../../plugins/copilot';
import { CopilotContextService } from '../../plugins/copilot/context';
import { CopilotContextResolver } from '../../plugins/copilot/context/resolver';
import {
  chatMessageFromTurn,
  turnFromChatMessage,
} from '../../plugins/copilot/core';
import { CopilotCronJobs } from '../../plugins/copilot/cron';
import {
  CopilotEmbeddingClientService,
  CopilotEmbeddingJob,
  MockEmbeddingClient,
} from '../../plugins/copilot/embedding';
import { PromptService } from '../../plugins/copilot/prompt';
import {
  CopilotProviderFactory,
  CopilotProviderType,
  ModelInputType,
  ModelOutputType,
  OpenAIProvider,
} from '../../plugins/copilot/providers';
import { TextStreamParser } from '../../plugins/copilot/providers/utils';
import { CopilotResolver } from '../../plugins/copilot/resolver';
import { ActionRuntimeBridge } from '../../plugins/copilot/runtime/action-runtime-bridge';
import { CapabilityRuntime } from '../../plugins/copilot/runtime/capability-runtime';
import {
  parsePromptRenderContract,
  parsePromptSessionContract,
} from '../../plugins/copilot/runtime/contracts';
import { projectActionEventToChatEvent } from '../../plugins/copilot/runtime/hosts/action-stream-host';
import { CapabilityPolicyHost } from '../../plugins/copilot/runtime/hosts/capability-policy-host';
import { ConversationHost } from '../../plugins/copilot/runtime/hosts/conversation-host';
import { ImageResultHost } from '../../plugins/copilot/runtime/hosts/image-result-host';
import { ModelSelectionPolicy } from '../../plugins/copilot/runtime/model-selection-policy';
import { PromptRuntime } from '../../plugins/copilot/runtime/prompt-runtime';
import { getProviderRuntimeHost } from '../../plugins/copilot/runtime/provider-runtime-context';
import { TurnOrchestrator } from '../../plugins/copilot/runtime/turn-orchestrator';
import { ChatSessionService } from '../../plugins/copilot/session';
import { CopilotStorage } from '../../plugins/copilot/storage';
import { CopilotTranscriptionService } from '../../plugins/copilot/transcript';
import { CopilotWorkspaceService } from '../../plugins/copilot/workspace';
import { PaymentModule } from '../../plugins/payment';
import { SubscriptionService } from '../../plugins/payment/service';
import { SubscriptionStatus } from '../../plugins/payment/types';
import { installMockCopilotRuntime, MockCopilotProvider } from '../mocks';
import { TestingPromptService } from '../mocks/prompt-service.mock';
import { createTestingModule, TestingModule } from '../utils';
import { singleUserPromptMessages, systemPrompt } from './prompt-test-helper';

type Context = {
  auth: AuthService;
  module: TestingModule;
  db: PrismaClient;
  event: EventBus;
  models: Models;
  workspace: WorkspaceModel;
  workspaceStorage: WorkspaceBlobStorage;
  copilotSession: CopilotSessionModel;
  context: CopilotContextService;
  prompt: TestingPromptService;
  transcript: CopilotTranscriptionService;
  workspaceEmbedding: CopilotWorkspaceService;
  factory: CopilotProviderFactory;
  session: ChatSessionService;
  promptRuntime: PromptRuntime;
  chatRuntime: CapabilityRuntime;
  conversationHost: ConversationHost;
  embeddingClients: CopilotEmbeddingClientService;
  jobs: CopilotEmbeddingJob;
  imageResults: ImageResultHost;
  orchestrator: TurnOrchestrator;
  storage: CopilotStorage;
  actionBridge: ActionRuntimeBridge;
  cronJobs: CopilotCronJobs;
  subscription: SubscriptionService;
  quotaState: QuotaStateService;
};

const buildTurn = (
  sessionId: string,
  message: Parameters<typeof turnFromChatMessage>[0]
) => turnFromChatMessage(message, sessionId);

const cleanSnapshotObject = (obj: unknown, omittedKeys: string[] = []) =>
  JSON.parse(
    JSON.stringify(obj, (k, v) =>
      ['id', 'createdAt', ...omittedKeys].includes(k) ||
      v === null ||
      (typeof v === 'object' && !Object.keys(v).length)
        ? undefined
        : v
    )
  );

const cleanFinalMessages = (messages: unknown) =>
  cleanSnapshotObject(messages, ['attachments']);

const test = ava as TestFn<Context>;
let userId: string;
let restoreMockCopilotNativeRuntime: (() => void) | undefined;

test.before(async t => {
  restoreMockCopilotNativeRuntime = installMockCopilotRuntime();
  const module = await createTestingModule({
    imports: [
      ConfigModule.override({
        copilot: {
          providers: {
            openai: {
              apiKey: process.env.COPILOT_OPENAI_API_KEY ?? '1',
            },
            fal: {
              apiKey: process.env.COPILOT_FAL_API_KEY ?? '1',
            },
            anthropic: {
              apiKey: process.env.COPILOT_ANTHROPIC_API_KEY ?? '1',
            },
          },
          exa: {
            key: process.env.COPILOT_EXA_API_KEY ?? '1',
          },
        },
      }),
      PaymentModule,
      QuotaModule,
      StorageModule,
      CopilotModule,
    ],
    tapModule: builder => {
      // use real JobQueue for testing
      builder.overrideProvider(JobQueue).useClass(JobQueue);
      builder.overrideProvider(RequestMutex).useValue({
        acquire: async () => ({
          async [Symbol.asyncDispose]() {},
        }),
      });
      builder.overrideProvider(PromptService).useClass(TestingPromptService);
      builder.overrideProvider(OpenAIProvider).useClass(MockCopilotProvider);
      builder.overrideProvider(SubscriptionService).useClass(
        class {
          select() {
            return { getSubscription: async () => undefined };
          }
        }
      );
    },
  });

  const auth = module.get(AuthService);
  const db = module.get(PrismaClient);
  const event = module.get(EventBus);
  const models = module.get(Models);
  const workspace = module.get(WorkspaceModel);
  const workspaceStorage = module.get(WorkspaceBlobStorage);
  const copilotSession = module.get(CopilotSessionModel);
  const prompt = module.get(PromptService) as TestingPromptService;
  const factory = module.get(CopilotProviderFactory);

  const session = module.get(ChatSessionService);
  const promptRuntime = module.get(PromptRuntime);
  const chatRuntime = module.get(CapabilityRuntime);
  const conversationHost = module.get(ConversationHost);
  const imageResults = module.get(ImageResultHost);
  const orchestrator = module.get(TurnOrchestrator);
  const actionBridge = module.get(ActionRuntimeBridge);
  const storage = module.get(CopilotStorage);

  const context = module.get(CopilotContextService);
  const embeddingClients = module.get(CopilotEmbeddingClientService);
  const jobs = module.get(CopilotEmbeddingJob);
  const transcript = module.get(CopilotTranscriptionService);
  const workspaceEmbedding = module.get(CopilotWorkspaceService);
  const cronJobs = module.get(CopilotCronJobs);
  const subscription = module.get(SubscriptionService);
  const quotaState = module.get(QuotaStateService);

  t.context.module = module;
  t.context.auth = auth;
  t.context.db = db;
  t.context.event = event;
  t.context.models = models;
  t.context.workspace = workspace;
  t.context.workspaceStorage = workspaceStorage;
  t.context.copilotSession = copilotSession;
  t.context.prompt = prompt;
  t.context.factory = factory;
  t.context.session = session;
  t.context.promptRuntime = promptRuntime;
  t.context.chatRuntime = chatRuntime;
  t.context.conversationHost = conversationHost;
  t.context.imageResults = imageResults;
  t.context.orchestrator = orchestrator;
  t.context.actionBridge = actionBridge;
  t.context.storage = storage;
  t.context.context = context;
  t.context.embeddingClients = embeddingClients;
  t.context.jobs = jobs;
  t.context.transcript = transcript;
  t.context.workspaceEmbedding = workspaceEmbedding;
  t.context.cronJobs = cronJobs;
  t.context.subscription = subscription;
  t.context.quotaState = quotaState;

  await module.initTestingDB();
});

let promptName = 'prompt';

test.beforeEach(async t => {
  Sinon.restore();
  const { auth, prompt } = t.context;
  prompt.reset();
  const user = await auth.signUp(`test-${randomUUID()}@affine.pro`, '123456');
  userId = user.id;
  promptName = randomUUID().replaceAll('-', '');
});

test.after.always(async t => {
  restoreMockCopilotNativeRuntime?.();
  await t.context.module?.close();
});

test('should reject context file uploads after workspace write access is revoked', async t => {
  const { auth, context, models, prompt, session, storage, workspace } =
    t.context;
  const contextResolver = await t.context.module.resolve(
    CopilotContextResolver
  );

  const owner = await auth.signUp(`test-${randomUUID()}@affine.pro`, '123456');
  const member = await auth.signUp(`test-${randomUUID()}@affine.pro`, '123456');
  const ws = await workspace.create(owner.id);

  await models.workspaceUser.set(ws.id, member.id, WorkspaceRole.Collaborator, {
    status: WorkspaceMemberStatus.Accepted,
  });
  await prompt.set(promptName, 'test', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  const sessionId = await session.create({
    userId: member.id,
    workspaceId: ws.id,
    docId: randomUUID(),
    promptName,
    pinned: false,
  });
  const contextSession = await context.create(sessionId);
  await models.workspaceUser.set(ws.id, member.id, WorkspaceRole.External);

  Sinon.stub(context, 'canEmbedding').get(() => true);
  Sinon.stub(context, 'embeddingClient').get(() => new MockEmbeddingClient());
  const put = Sinon.stub(storage, 'put').resolves();
  const buffer = Buffer.from('test pdf');

  await t.throwsAsync(
    contextResolver.addContextFile(
      { id: member.id } as any,
      {
        req: {
          headers: {
            'content-length': String(buffer.length),
          },
        },
      } as any,
      { contextId: contextSession.id },
      {
        filename: 'sample.pdf',
        mimetype: 'application/pdf',
        createReadStream: () => Readable.from(buffer),
      } as any
    ),
    {
      instanceOf: SpaceAccessDenied,
    }
  );

  t.false(put.called);
});

test('should prioritize user-added context file embedding jobs', async t => {
  const { context, jobs, prompt, session, storage, workspace } = t.context;
  const contextResolver = await t.context.module.resolve(
    CopilotContextResolver
  );

  const ws = await workspace.create(userId);
  await prompt.set(promptName, 'test', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  const sessionId = await session.create({
    userId,
    workspaceId: ws.id,
    docId: randomUUID(),
    promptName,
    pinned: false,
  });
  const contextSession = await context.create(sessionId);

  Sinon.stub(context, 'canEmbedding').get(() => true);
  Sinon.stub(context, 'embeddingClient').get(() => new MockEmbeddingClient());
  const put = Sinon.stub(storage, 'put').resolves();
  const queue = Sinon.stub(jobs, 'addFileEmbeddingQueue').resolves();
  const buffer = Buffer.from('test pdf');

  await contextResolver.addContextFile(
    { id: userId } as any,
    {
      req: {
        headers: {
          'content-length': String(buffer.length),
        },
      },
    } as any,
    { contextId: contextSession.id },
    {
      filename: 'sample.pdf',
      mimetype: 'application/pdf',
      createReadStream: () => Readable.from(buffer),
    } as any
  );

  t.true(put.calledOnce);
  t.true(queue.calledOnce);
  t.deepEqual(queue.firstCall.args[0], {
    userId,
    workspaceId: ws.id,
    contextId: contextSession.id,
    blobId: createHash('sha256').update(buffer).digest('base64url'),
    fileId: queue.firstCall.args[0].fileId,
    fileName: 'sample.pdf',
  });
  t.deepEqual(queue.firstCall.args[1], { priority: 0 });
});

test('should resolve context sessions with the shared embedding client', async t => {
  const { context, embeddingClients, prompt, session, workspace } = t.context;

  const ws = await workspace.create(userId);
  await prompt.set(promptName, 'test', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  const sessionId = await session.create({
    userId,
    workspaceId: ws.id,
    docId: randomUUID(),
    promptName,
    pinned: false,
  });
  const client = new MockEmbeddingClient();

  Sinon.stub(embeddingClients, 'refresh').resolves(undefined);
  Sinon.stub(embeddingClients, 'getClient').returns(client);
  await context.onConfigChanged();

  const contextSession = await context.create(sessionId);
  t.is(context.embeddingClient, client);
  await t.notThrowsAsync(context.get(contextSession.id));
});

test('should be able to render prompt', async t => {
  const { prompt } = t.context;

  const msg = {
    role: 'system' as const,
    content: 'translate {{src_language}} to {{dest_language}}: {{content}}',
    params: { src_language: ['eng'], dest_language: ['chs', 'jpn', 'kor'] },
  };
  const params = {
    src_language: 'eng',
    dest_language: 'chs',
    content: 'hello world',
  };

  await prompt.set(promptName, 'test', [msg]);
  const testPrompt = await prompt.get(promptName);
  t.assert(testPrompt, 'should have prompt');
  t.is(
    prompt.finish(testPrompt!, params).pop()?.content,
    'translate eng to chs: hello world',
    'should render the prompt'
  );
  t.deepEqual(
    testPrompt?.paramKeys,
    Object.keys(params),
    'should have param keys'
  );
  t.deepEqual(testPrompt?.params, msg.params, 'should have params');
  // will use first option if a params not provided
  t.deepEqual(prompt.finish(testPrompt!, { src_language: 'abc' }), [
    {
      content: 'translate eng to chs: ',
      params: { dest_language: 'chs', src_language: 'eng' },
      role: 'system',
    },
  ]);
});

test('should be able to render listed prompt', async t => {
  const { prompt } = t.context;

  const msg = {
    role: 'system' as const,
    content: 'links:\n{{#links}}- {{.}}\n{{/links}}',
  };
  const params = {
    links: ['https://affine.pro', 'https://github.com/toeverything/affine'],
  };

  await prompt.set(promptName, 'test', [msg]);
  const testPrompt = await prompt.get(promptName);

  t.is(
    prompt.finish(testPrompt!, params).pop()?.content,
    'links:\n- https://affine.pro\n- https://github.com/toeverything/affine\n',
    'should render the prompt'
  );
});

test('PromptContract should preserve render/session payloads and reject legacy aliases', t => {
  const render = parsePromptRenderContract({
    messages: [
      {
        role: 'system',
        content: 'Return JSON only.',
        responseFormat: {
          type: 'json_schema',
          responseSchemaJson: {
            type: 'object',
            properties: { summary: { type: 'string' } },
            required: ['summary'],
          },
          schemaHash: 'schema-hash',
        },
      },
    ],
    templateParams: {},
    renderParams: { tone: 'brief' },
  });

  t.deepEqual(
    { messages: render.messages, warnings: [] },
    {
      messages: render.messages,
      warnings: [],
    }
  );

  const session = parsePromptSessionContract({
    prompt: {
      model: 'gpt-5-mini',
      promptTokens: 12,
      templateParams: {},
      messages: [systemPrompt('Return JSON only.')],
    },
    turns: singleUserPromptMessages('hello'),
    renderParams: { tone: 'brief' },
    maxTokenSize: 1024,
  });

  t.is(session.prompt.model, 'gpt-5-mini');

  const error = t.throws(() =>
    parsePromptRenderContract({
      messages: [
        {
          role: 'system',
          content: 'Return JSON only.',
          responseFormat: {
            type: 'json_schema',
            schemaJson: { type: 'object' },
            schemaHash: 'schema-hash',
          },
        },
      ],
      templateParams: {},
      renderParams: {},
    })
  );

  t.truthy(error);
});

test('capability runtime should require explicit structured schema contract', async t => {
  const runtime = new CapabilityRuntime({} as never, {} as never);

  const error = await t.throwsAsync(() =>
    runtime.generateStructuredValue(
      { modelId: 'gpt-5-mini' },
      singleUserPromptMessages('Summarize AFFiNE.'),
      {
        responseSchemaJson: {
          type: 'object',
          properties: { summary: { type: 'string' } },
          required: ['summary'],
          additionalProperties: false,
        },
      }
    )
  );

  t.true(error instanceof Error);
  t.regex(error.message, /Structured schema contract is required/);
});

// ==================== session ====================

test('should be able to manage chat session', async t => {
  const { prompt, session } = t.context;

  await prompt.set(promptName, 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  const params = { word: 'world' };
  const commonParams = { docId: 'test', workspaceId: 'test', pinned: false };

  const sessionId = await session.create({
    userId,
    promptName,
    ...commonParams,
  });
  t.truthy(sessionId, 'should create session');

  const s = (await session.get(sessionId))!;
  t.is(s.config.sessionId, sessionId, 'should get session');
  t.is(s.config.promptName, promptName, 'should have prompt name');
  t.is(s.model, 'model', 'should have model');

  s.pushTurn(
    buildTurn(sessionId, {
      role: 'user',
      content: 'hello',
      createdAt: new Date(),
    })
  );

  const finalMessages = cleanFinalMessages(s.finish(params));
  t.snapshot(finalMessages, 'should generate the final message');
  await s.save();

  const s1 = (await session.get(sessionId))!;
  t.deepEqual(
    cleanFinalMessages(s1.finish(params)),
    finalMessages,
    'should same as before message'
  );
  t.snapshot(
    cleanFinalMessages(s1.finish(params)),
    'should generate different message with another params'
  );

  // should get main session after fork if re-create a chat session for same docId and workspaceId
  {
    const newSessionId = await session.create({
      userId,
      promptName,
      ...commonParams,
    });
    t.is(newSessionId, sessionId, 'should get same session id');
  }

  // should create a fresh session when reuseLatestChat is explicitly disabled
  {
    const newSessionId = await session.create({
      userId,
      promptName,
      ...commonParams,
      reuseLatestChat: false,
    });
    t.not(
      newSessionId,
      sessionId,
      'should create new session id when reuseLatestChat is false'
    );
  }
});

test('should be able to update chat session prompt', async t => {
  const { prompt, session } = t.context;

  // Set up a prompt to be used in the session
  await prompt.set(promptName, 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  // Create a session
  const sessionId = await session.create({
    promptName,
    docId: 'test',
    workspaceId: 'test',
    userId,
    pinned: false,
  });
  t.truthy(sessionId, 'should create session');

  // Update the session
  const updatedSessionId = await session.update({
    sessionId,
    promptName: 'Chat With AFFiNE AI',
    userId,
  });
  t.is(updatedSessionId, sessionId, 'should update session with same id');

  // Verify the session was updated
  const updatedSession = await session.get(sessionId);
  t.truthy(updatedSession, 'should retrieve updated session');
  t.is(
    updatedSession?.config.promptName,
    'Chat With AFFiNE AI',
    'should have updated prompt name'
  );
});

test('should be able to fork chat session', async t => {
  const { auth, prompt, session } = t.context;

  await prompt.set(promptName, 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  const params = { word: 'world' };
  const commonParams = { docId: 'test', workspaceId: 'test', pinned: false };
  // create session
  const sessionId = await session.create({
    userId,
    promptName,
    ...commonParams,
  });
  const s = (await session.get(sessionId))!;
  s.pushTurn(
    buildTurn(sessionId, {
      role: 'user',
      content: 'hello',
      createdAt: new Date(),
    })
  );
  s.pushTurn(
    buildTurn(sessionId, {
      role: 'assistant',
      content: 'world',
      createdAt: new Date(),
    })
  );
  s.pushTurn(
    buildTurn(sessionId, {
      role: 'user',
      content: 'aaa',
      createdAt: new Date(),
    })
  );
  s.pushTurn(
    buildTurn(sessionId, {
      role: 'assistant',
      content: 'bbb',
      createdAt: new Date(),
    })
  );
  await s.save();

  // fork session
  const latestMessageId = (await session.getState(sessionId))?.turns.find(
    turn => turn.role === 'assistant'
  )?.id;
  t.truthy(latestMessageId);
  const forkedSessionId1 = await session.fork({
    userId,
    sessionId,
    latestMessageId: latestMessageId!,
    ...commonParams,
  });
  t.not(sessionId, forkedSessionId1, 'should fork a new session');

  const newUser = await auth.signUp('darksky.1@affine.pro', '123456');
  const forkedSessionId2 = await session.fork({
    userId: newUser.id,
    sessionId,
    latestMessageId: latestMessageId!,
    ...commonParams,
  });
  t.not(
    forkedSessionId1,
    forkedSessionId2,
    'should fork new session with same params'
  );

  // fork session without latestMessageId
  const forkedSessionId3 = await session.fork({
    userId,
    sessionId,
    ...commonParams,
  });

  // fork session with wrong latestMessageId
  await t.throwsAsync(
    session.fork({
      userId,
      sessionId,
      latestMessageId: 'wrong-message-id',
      ...commonParams,
    }),
    {
      instanceOf: Error,
    },
    'should not able to fork new session with wrong latestMessageId'
  );

  // check forked session messages
  {
    const s2 = (await session.get(forkedSessionId1))!;

    const finalMessages = s2.finish(params);
    t.snapshot(
      cleanSnapshotObject(finalMessages),
      'should generate the final message'
    );
  }

  // check second times forked session
  {
    const s2 = (await session.get(forkedSessionId2))!;

    // should overwrite user id
    t.is(s2.config.userId, newUser.id, 'should have same user id');

    const finalMessages = s2.finish(params);
    t.snapshot(
      cleanSnapshotObject(finalMessages),
      'should generate the final message'
    );
  }

  // check third times forked session
  {
    const s3 = (await session.get(forkedSessionId3))!;
    const finalMessages = s3.finish(params);
    t.snapshot(
      cleanSnapshotObject(finalMessages),
      'should generate the final message'
    );
  }

  // check original session messages
  {
    const s4 = (await session.get(sessionId))!;
    const finalMessages = s4.finish(params);
    t.snapshot(
      cleanSnapshotObject(finalMessages),
      'should generate the final message'
    );
  }

  // should get main session after fork if re-create a chat session for same docId and workspaceId
  {
    const newSessionId = await session.create({
      userId,
      promptName,
      ...commonParams,
    });
    t.is(newSessionId, sessionId, 'should get same session id');
  }
});

test('should schedule title generation as a background job', async t => {
  const { prompt, session, module, workspace } = t.context;
  const jobs = module.get(JobQueue);

  const ws = await workspace.create(userId);
  await prompt.set(promptName, 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  const sessionId = await session.create({
    userId,
    promptName,
    docId: 'test',
    workspaceId: ws.id,
    pinned: false,
  });
  const chatSession = await session.get(sessionId);
  t.truthy(chatSession);

  const addJob = Sinon.stub(jobs, 'add').resolves();

  chatSession!.pushTurn(
    buildTurn(sessionId, {
      role: 'user',
      content: 'hello',
      createdAt: new Date(),
    })
  );
  await chatSession!.save();

  t.true(addJob.calledOnce);
  t.deepEqual(addJob.firstCall.args, [
    'copilot.session.generateTitle',
    { sessionId },
    { priority: 100 },
  ]);
});

test('should merge latest user turn content and attachments into prompt', async t => {
  const { prompt, session } = t.context;

  await prompt.set(promptName, 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  for (const testCase of [
    {
      title: 'text message',
      message: { content: 'hello' },
      project: (messages: { content: string }[]) =>
        messages.map(({ content }) => content),
      expected: ['hello world', 'hello'],
    },
    {
      title: 'attachment message',
      message: { attachments: ['https://affine.pro/example.jpg'] as string[] },
      project: (messages: { attachments?: unknown }[]) =>
        messages.map(({ attachments }) => attachments),
      expected: [undefined, ['https://affine.pro/example.jpg']],
    },
    {
      title: 'empty message',
      message: {},
      project: (messages: { content: string }[]) =>
        messages.map(({ content }) => content),
      expected: ['hello world'],
    },
  ]) {
    const sessionId = await session.create({
      docId: 'test',
      workspaceId: 'test',
      userId,
      promptName,
      pinned: false,
    });
    const s = (await session.get(sessionId))!;
    s.pushTurn(
      buildTurn(sessionId, {
        role: 'user',
        content: testCase.message.content ?? '',
        attachments: testCase.message.attachments,
        createdAt: new Date(),
      })
    );
    t.deepEqual(
      testCase.project(s.finish({ word: 'world' })),
      testCase.expected,
      testCase.title
    );
  }
});

test('should preserve file handle attachments when merging user content into prompt', async t => {
  const { prompt, session } = t.context;

  await prompt.set(promptName, 'model', [
    { role: 'user', content: '{{content}}' },
  ]);

  const sessionId = await session.create({
    docId: 'test',
    workspaceId: 'test',
    userId,
    promptName,
    pinned: false,
  });
  const s = (await session.get(sessionId))!;

  s.pushTurn(
    buildTurn(sessionId, {
      role: 'user',
      content: 'Summarize this file',
      attachments: [
        {
          kind: 'file_handle',
          fileHandle: 'file_123',
          mimeType: 'application/pdf',
        },
      ],
      createdAt: new Date(),
    })
  );
  const finalMessages = s.finish({});

  t.deepEqual(finalMessages, [
    {
      role: 'user',
      content: 'Summarize this file',
      attachments: [
        {
          kind: 'file_handle',
          fileHandle: 'file_123',
          mimeType: 'application/pdf',
        },
      ],
      params: {
        content: 'Summarize this file',
      },
    },
  ]);
});

test('should preserve assistant render trace when converting between chat message and turn', t => {
  const sessionId = randomUUID();
  const createdAt = new Date('2025-01-01T00:00:00.000Z');
  const message = {
    id: 'message-1',
    role: 'assistant' as const,
    content: 'Final answer',
    attachments: [
      {
        kind: 'file_handle' as const,
        fileHandle: 'file_123',
        mimeType: 'application/pdf',
      },
    ],
    params: {
      schemaVersion: 'v1',
    },
    streamObjects: [
      { type: 'reasoning' as const, textDelta: 'Plan' },
      {
        type: 'tool-call' as const,
        toolCallId: 'call_1',
        toolName: 'doc_read',
        args: { docId: 'doc-1' },
        rawArgumentsText: '{"docId":"doc-1"}',
        thought: 'Need the current doc',
      },
      { type: 'text-delta' as const, textDelta: 'Final answer' },
      {
        type: 'tool-result' as const,
        toolCallId: 'call_2',
        toolName: 'doc_keyword_search',
        args: { query: 'affine' },
        result: { hits: ['doc-2'] },
      },
    ],
    createdAt,
  };

  const turn = turnFromChatMessage(message, sessionId);

  t.deepEqual(turn.renderTrace, message.streamObjects);
  t.deepEqual(
    turn.toolEvents.map(event => event.type),
    ['tool_call', 'tool_result']
  );
  t.deepEqual(chatMessageFromTurn(turn), message);
});

test('should save message correctly', async t => {
  const { prompt, session } = t.context;

  await prompt.set(promptName, 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  const sessionId = await session.create({
    docId: 'test',
    workspaceId: 'test',
    userId,
    promptName,
    pinned: false,
  });
  const s = (await session.get(sessionId))!;

  s.pushTurn(
    buildTurn(sessionId, {
      role: 'user',
      content: 'hello',
      createdAt: new Date(),
    })
  );
  t.is(s.stashTurns.length, 1, 'should get stash turns');
  await s.save();
  t.is(s.stashTurns.length, 0, 'should empty stash turns after save');
});

test('should revert message correctly', async t => {
  const { prompt, session } = t.context;

  // init session
  let sessionId: string;
  {
    await prompt.set(promptName, 'model', [
      { role: 'system', content: 'hello {{word}}' },
    ]);

    sessionId = await session.create({
      docId: 'test',
      workspaceId: 'test',
      userId,
      promptName,
      pinned: false,
    });
    const s = (await session.get(sessionId))!;

    s.pushTurn(
      buildTurn(sessionId, {
        role: 'user',
        content: '1',
        createdAt: new Date(),
      })
    );
    await s.save();
  }

  // check ChatSession behavior
  {
    const s = (await session.get(sessionId))!;
    s.pushTurn(
      buildTurn(sessionId, {
        role: 'assistant',
        content: '2',
        createdAt: new Date(),
      })
    );
    s.pushTurn(
      buildTurn(sessionId, {
        role: 'user',
        content: '3',
        createdAt: new Date(),
      })
    );
    s.pushTurn(
      buildTurn(sessionId, {
        role: 'assistant',
        content: '4',
        createdAt: new Date(),
      })
    );
    await s.save();
    const beforeRevert = s.finish({ word: 'world' });
    t.snapshot(
      cleanSnapshotObject(beforeRevert),
      'should have three messages before revert'
    );

    {
      s.revertLatestMessage(false);
      const afterRevert = s.finish({ word: 'world' });
      t.snapshot(
        cleanSnapshotObject(afterRevert),
        'should remove assistant message after revert'
      );
    }

    {
      s.revertLatestMessage(true);
      const afterRevert = s.finish({ word: 'world' });
      t.snapshot(
        cleanSnapshotObject(afterRevert),
        'should remove assistant message after revert'
      );
    }
  }

  // check database behavior
  {
    let s = (await session.get(sessionId))!;

    const beforeRevert = s.finish({ word: 'world' });
    t.snapshot(
      cleanSnapshotObject(beforeRevert),
      'should have three messages before revert'
    );

    {
      await session.revertLatestMessage(sessionId, false);
      s = (await session.get(sessionId))!;
      const afterRevert = s.finish({ word: 'world' });
      t.snapshot(
        cleanSnapshotObject(afterRevert),
        'should remove assistant message after revert'
      );
    }

    {
      await session.revertLatestMessage(sessionId, true);
      s = (await session.get(sessionId))!;
      const afterRevert = s.finish({ word: 'world' });
      t.snapshot(
        cleanSnapshotObject(afterRevert),
        'should remove assistant message after revert'
      );
    }
  }
});

test('should handle params correctly in chat session', async t => {
  const { prompt, session } = t.context;

  await prompt.set(promptName, 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  const sessionId = await session.create({
    docId: 'test',
    workspaceId: 'test',
    userId,
    promptName,
    pinned: false,
  });

  const s = (await session.get(sessionId))!;

  // Case 1: When params is provided directly
  {
    const directParams = { word: 'direct' };
    const messages = s.finish(directParams);
    t.is(messages[0].content, 'hello direct', 'should use provided params');
  }

  // Case 2: When no params provided but last message has params
  {
    s.pushTurn(
      buildTurn(sessionId, {
        role: 'user',
        content: 'test message',
        params: { word: 'fromMessage' },
        createdAt: new Date(),
      })
    );
    const messages = s.finish({});
    t.is(
      messages[0].content,
      'hello fromMessage',
      'should use params from last message'
    );
  }

  // Case 3: When neither params provided nor last message has params
  {
    s.pushTurn(
      buildTurn(sessionId, {
        role: 'user',
        content: 'test message without params',
        createdAt: new Date(),
      })
    );
    const messages = s.finish({});
    t.is(messages[0].content, 'hello ', 'should use empty params');
  }
});

// ==================== provider ====================

test('should be able to get provider', async t => {
  const { factory } = t.context;

  {
    const p = await factory.getProvider({ outputType: ModelOutputType.Text });
    t.is(
      p?.type.toString(),
      'openai',
      'should get provider support text-to-text'
    );
  }

  {
    const p = await factory.getProvider({
      outputType: ModelOutputType.Image,
      inputTypes: [ModelInputType.Image],
      modelId: 'lora/image-to-image',
    });
    t.is(
      p?.type.toString(),
      'fal',
      'should get provider supporting image output'
    );
  }

  {
    const p = await factory.getProvider(
      {
        outputType: ModelOutputType.Image,
        inputTypes: [ModelInputType.Image],
      },
      { prefer: CopilotProviderType.FAL }
    );
    t.is(
      p?.type.toString(),
      'fal',
      'should get provider supporting text output with image input'
    );
  }

  // if a model is not defined and not available in online api
  // it should return null
  {
    const p = await factory.getProvider({
      outputType: ModelOutputType.Text,
      inputTypes: [ModelInputType.Text],
      modelId: 'gpt-4-not-exist',
    });
    t.falsy(p, 'should not get provider');
  }
});

test('should resolve provider by prefixed model id', async t => {
  const { factory } = t.context;

  const resolved = await factory.resolveProvider({
    modelId: 'openai-default/test',
    outputType: ModelOutputType.Text,
  });
  t.truthy(resolved, 'should resolve prefixed model id');
  if (!resolved) {
    throw new Error('should resolve prefixed model id');
  }

  t.is(resolved.provider.type, CopilotProviderType.OpenAI);

  const result = await getProviderRuntimeHost(resolved.provider).run.text(
    { modelId: resolved.modelId },
    [{ role: 'user', content: 'hello' }],
    undefined,
    resolved.execution
  );
  t.is(result, 'generate text to text');
});

test('should fallback to null when prefixed provider id does not exist', async t => {
  const { factory } = t.context;

  const provider = await factory.getProviderByModel('unknown/test');
  t.is(provider, null);
});

// ==================== action runtime ====================

const wrapAsyncIter = async <T>(iter: AsyncIterable<T>) => {
  const result: T[] = [];
  for await (const r of iter) {
    result.push(r);
  }
  return result;
};

test('action stream should expose successful text action result as message', t => {
  t.deepEqual(
    projectActionEventToChatEvent('message-1', {
      type: 'action_done',
      actionId: 'slides.outline',
      actionVersion: 'v1',
      status: 'succeeded',
      runId: 'run-1',
      result: '- Launch deck',
    }),
    {
      type: 'message',
      id: 'message-1',
      data: '- Launch deck',
    }
  );
});

test('turn orchestrator should persist generated image links through image result host', async t => {
  const { conversationHost, imageResults, orchestrator, chatRuntime, module } =
    t.context;
  const capabilityPolicy = module.get(CapabilityPolicyHost);
  const session = {
    latestUserTurn: { attachments: ['https://example.com/source.png'] },
    config: { sessionId: 'session-1' },
    finish: Sinon.stub().returns([
      {
        role: 'system',
        content: 'generate image',
        params: { quality: 'hd', seed: '7' },
      },
    ]),
  } as any;

  Sinon.stub(conversationHost, 'prepareTurn').resolves({
    messageId: 'message-1',
    params: {},
    session,
    latestTurn: undefined,
  } as any);
  Sinon.stub(capabilityPolicy, 'selectChat').resolves({
    model: 'test-image-model',
    providerOptions: { format: 'png' },
  } as any);
  Sinon.stub(chatRuntime, 'streamImageArtifacts').callsFake(async function* () {
    yield { url: 'https://remote.example/1.png', media_type: 'image/png' };
    yield { url: 'https://remote.example/2.png', media_type: 'image/png' };
  });
  const persistNativeArtifact = Sinon.stub(
    imageResults,
    'persistNativeArtifact'
  ).callsFake(
    async (_userId, _workspaceId, artifact) => `stored:${artifact.url}`
  );
  const persistAssistantTurn = Sinon.stub(
    conversationHost,
    'persistAssistantTurn'
  ).resolves();

  const prepared = await orchestrator.streamImages('user-1', 'session-1', {
    modelId: 'chat-model',
  });
  const result = await wrapAsyncIter(prepared.stream);

  t.deepEqual(result, [
    'stored:https://remote.example/1.png',
    'stored:https://remote.example/2.png',
  ]);
  t.deepEqual(
    (chatRuntime.streamImageArtifacts as Sinon.SinonStub).firstCall.args[0],
    {
      modelId: undefined,
      inputTypes: [ModelInputType.Image],
    }
  );
  t.deepEqual(
    (chatRuntime.streamImageArtifacts as Sinon.SinonStub).firstCall.args[2],
    {
      format: 'png',
      quality: 'hd',
      seed: 7,
      signal: undefined,
    }
  );
  t.deepEqual(
    persistNativeArtifact.getCalls().map(call => call.args),
    [
      [
        'user-1',
        'session-1',
        { url: 'https://remote.example/1.png', media_type: 'image/png' },
      ],
      [
        'user-1',
        'session-1',
        { url: 'https://remote.example/2.png', media_type: 'image/png' },
      ],
    ]
  );
  t.true(persistAssistantTurn.calledOnce);
  t.deepEqual(persistAssistantTurn.firstCall.args[1].attachments, result);
});

test('TextStreamParser should format different types of chunks correctly', t => {
  // Define interfaces for fixtures
  interface BaseFixture {
    chunk: any;
    description: string;
  }

  interface ContentFixture extends BaseFixture {
    expected: string;
  }

  interface ErrorFixture extends BaseFixture {
    errorMessage: string;
  }

  type ChunkFixture = ContentFixture | ErrorFixture;

  // Define test fixtures for different chunk types
  const fixtures: Record<string, ChunkFixture> = {
    textDelta: {
      chunk: {
        type: 'text-delta' as const,
        text: 'Hello world',
      },
      expected: 'Hello world',
      description: 'should format text-delta correctly',
    },
    reasoning: {
      chunk: {
        type: 'reasoning-delta' as const,
        text: 'I need to think about this',
      },
      expected: '\n> [!]\n> I need to think about this',
      description: 'should format reasoning as callout',
    },
    webSearch: {
      chunk: {
        type: 'tool-call' as const,
        toolName: 'web_search_exa' as const,
        toolCallId: 'test-id-1',
        input: { query: 'test query', mode: 'AUTO' as const },
      },
      expected: '\n> [!]\n> \n> Searching the web "test query"\n> ',
      description: 'should format web search tool call correctly',
    },
    webCrawl: {
      chunk: {
        type: 'tool-call' as const,
        toolName: 'web_crawl_exa' as const,
        toolCallId: 'test-id-2',
        input: { url: 'https://example.com' },
      },
      expected: '\n> [!]\n> \n> Crawling the web "https://example.com"\n> ',
      description: 'should format web crawl tool call correctly',
    },
    toolResult: {
      chunk: {
        type: 'tool-result' as const,
        toolName: 'web_search_exa' as const,
        toolCallId: 'test-id-1',
        input: { query: 'test query', mode: 'AUTO' as const },
        output: [
          {
            title: 'Test Title',
            url: 'https://test.com',
            content: 'Test content',
            favicon: undefined,
            publishedDate: undefined,
            author: undefined,
          },
          {
            title: null,
            url: 'https://example.com',
            content: 'Example content',
            favicon: undefined,
            publishedDate: undefined,
            author: undefined,
          },
        ],
      } as any,
      expected:
        '\n> [!]\n> \n> \n> \n> [Test Title](https://test.com)\n> \n> \n> \n> [https://example.com](https://example.com)\n> \n> \n> ',
      description: 'should format tool result correctly',
    },
    error: {
      chunk: {
        type: 'error' as const,
        error: { type: 'testError', message: 'Test error message' },
      },
      errorMessage: 'Test error message',
      description: 'should throw error for error chunks',
    },
  };

  // Test each chunk type individually
  Object.entries(fixtures).forEach(([_name, fixture]) => {
    const parser = new TextStreamParser();
    if ('errorMessage' in fixture) {
      t.throws(
        () => parser.parse(fixture.chunk),
        { message: fixture.errorMessage },
        fixture.description
      );
    } else {
      const result = parser.parse(fixture.chunk);
      t.is(result, fixture.expected, fixture.description);
    }
  });
});

test('TextStreamParser should process a sequence of message chunks', t => {
  const parser = new TextStreamParser();

  // Define test fixtures for mixed chunks sequence
  const mixedChunksFixture = {
    chunks: [
      // Reasoning chunks
      {
        id: nanoid(),
        type: 'reasoning-delta' as const,
        text: 'The user is asking about',
      },
      {
        id: nanoid(),
        type: 'reasoning-delta' as const,
        text: ' recent advances in quantum computing',
      },
      {
        id: nanoid(),
        type: 'reasoning-delta' as const,
        text: ' and how it might impact',
      },
      {
        id: nanoid(),
        type: 'reasoning-delta' as const,
        text: ' cryptography and data security.',
      },
      {
        id: nanoid(),
        type: 'reasoning-delta' as const,
        text: ' I should provide information on quantum supremacy achievements',
      },

      // Text delta
      {
        id: nanoid(),
        type: 'text-delta' as const,
        text: 'Let me search for the latest breakthroughs in quantum computing and their ',
      },

      // Tool call
      {
        type: 'tool-call' as const,
        toolCallId: 'toolu_01ABCxyz123456789',
        toolName: 'web_search_exa' as const,
        input: {
          query: 'latest quantum computing breakthroughs cryptography impact',
        },
      },

      // Tool result
      {
        type: 'tool-result' as const,
        toolCallId: 'toolu_01ABCxyz123456789',
        toolName: 'web_search_exa' as const,
        input: {
          query: 'latest quantum computing breakthroughs cryptography impact',
        },
        output: [
          {
            title: 'IBM Unveils 1000-Qubit Quantum Processor',
            url: 'https://example.com/tech/quantum-computing-milestone',
          },
        ],
      },

      // More text deltas
      {
        id: nanoid(),
        type: 'text-delta' as const,
        text: 'implications for security.',
      },
      {
        id: nanoid(),
        type: 'text-delta' as const,
        text: '\n\nQuantum computing has made ',
      },
      {
        id: nanoid(),
        type: 'text-delta' as const,
        text: 'remarkable progress in the past year. ',
      },
      {
        id: nanoid(),
        type: 'text-delta' as const,
        text: 'The development of more stable qubits has accelerated research significantly.',
      },
    ],
    expected:
      '\n> [!]\n> The user is asking about recent advances in quantum computing and how it might impact cryptography and data security. I should provide information on quantum supremacy achievements\n\nLet me search for the latest breakthroughs in quantum computing and their \n> [!]\n> \n> Searching the web "latest quantum computing breakthroughs cryptography impact"\n> \n> \n> \n> [IBM Unveils 1000-Qubit Quantum Processor](https://example.com/tech/quantum-computing-milestone)\n> \n> \n> \n\nimplications for security.\n\nQuantum computing has made remarkable progress in the past year. The development of more stable qubits has accelerated research significantly.',
    description:
      'should format the entire stream correctly with proper sequence',
  };

  // Process all chunks sequentially
  let result = '';
  for (const chunk of mixedChunksFixture.chunks) {
    result += parser.parse(chunk);
  }

  // Check final processed output
  t.is(result, mixedChunksFixture.expected, mixedChunksFixture.description);
});

// ==================== context ====================
test('should be able to manage context', async t => {
  const {
    context,
    event,
    jobs,
    prompt,
    session,
    storage,
    workspace,
    workspaceStorage,
  } = t.context;

  const ws = await workspace.create(userId);

  await prompt.set(promptName, 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);
  const chatSession = await session.create({
    docId: 'test',
    workspaceId: ws.id,
    userId,
    promptName,
    pinned: false,
  });

  // use mocked embedding client
  Sinon.stub(context, 'embeddingClient').get(() => new MockEmbeddingClient());
  Sinon.stub(jobs, 'embeddingClient').get(() => new MockEmbeddingClient());

  {
    await t.throwsAsync(
      context.create(randomUUID()),
      { instanceOf: Error },
      'should throw error if create context with invalid session id'
    );

    const session = context.create(chatSession);
    await t.notThrowsAsync(session, 'should create context with chat session');

    await t.notThrowsAsync(
      context.get((await session).id),
      'should get context after create'
    );

    await t.throwsAsync(
      context.get(randomUUID()),
      { instanceOf: Error },
      'should throw error if get context with invalid id'
    );
  }

  const fs = await import('node:fs');
  const buffer = fs.readFileSync(
    ProjectRoot.join('packages/common/native/fixtures/sample.pdf').toFileUrl()
  );

  {
    const session = await context.create(chatSession);

    // file record
    {
      await storage.put(userId, session.workspaceId, 'blob', buffer);
      const file = await session.addFile(
        'blob',
        'sample.pdf',
        'application/pdf'
      );

      const handler = Sinon.spy(event, 'emit');

      await jobs.embedPendingFile({
        userId,
        workspaceId: session.workspaceId,
        contextId: session.id,
        blobId: file.blobId,
        fileId: file.id,
        fileName: file.name,
      });

      t.deepEqual(handler.lastCall.args, [
        'workspace.file.embed.finished',
        {
          contextId: session.id,
          fileId: file.id,
          chunkSize: 1,
        },
      ]);

      const list = session.files;
      t.deepEqual(
        list.map(f => f.id),
        [file.id],
        'should list file id'
      );

      const result = await session.matchFiles('test', 1, undefined, 1);
      t.is(result.length, 1, 'should match context');
      t.is(result[0].fileId, file.id, 'should match file id');
    }

    // blob record
    {
      const blobId = 'test-blob';
      await workspaceStorage.put(session.workspaceId, blobId, buffer);

      await jobs.embedPendingBlob({ workspaceId: session.workspaceId, blobId });

      const result = await t.context.context.matchWorkspaceBlobs(
        session.workspaceId,
        'test',
        1,
        undefined,
        1
      );
      t.is(result.length, 1, 'should match blob embedding');
      t.is(result[0].blobId, blobId, 'should match blob id');
    }

    // doc record

    const addDoc = async () => {
      const docId = randomUUID();
      await t.context.db.snapshot.create({
        data: {
          workspaceId: session.workspaceId,
          id: docId,
          blob: Buffer.from([1, 1]),
          state: Buffer.from([1, 1]),
          updatedAt: new Date(),
          createdAt: new Date(),
        },
      });
      return docId;
    };

    {
      const docId = await addDoc();
      await session.addDocRecord(docId);
      const docs = session.docs.map(d => d.id);
      t.deepEqual(docs, [docId], 'should list doc id');

      await session.removeDocRecord(docId);
      t.deepEqual(session.docs, [], 'should remove doc id');
    }

    // tag record
    {
      const tagId = randomUUID();

      const docId1 = await addDoc();
      const docId2 = await addDoc();

      {
        await session.addCategoryRecord(ContextCategories.Tag, tagId, [docId1]);
        const tags = session.tags.map(t => t.id);
        t.deepEqual(tags, [tagId], 'should list tag id');

        const docs = session.tags.flatMap(l => l.docs.map(d => d.id));
        t.deepEqual(docs, [docId1], 'should list doc ids');
      }

      {
        await session.addCategoryRecord(ContextCategories.Tag, tagId, [docId2]);

        const docs = session.tags.flatMap(l => l.docs.map(d => d.id));
        t.deepEqual(docs, [docId1, docId2], 'should list doc ids');
      }

      await session.removeCategoryRecord(ContextCategories.Tag, tagId);
      t.deepEqual(session.tags, [], 'should remove tag id');
    }

    // collection record
    {
      const collectionId = randomUUID();

      const docId1 = await addDoc();
      const docId2 = await addDoc();
      {
        await session.addCategoryRecord(
          ContextCategories.Collection,
          collectionId,
          [docId1]
        );
        const collection = session.collections.map(l => l.id);
        t.deepEqual(collection, [collectionId], 'should list collection id');

        const docs = session.collections.flatMap(l => l.docs.map(d => d.id));
        t.deepEqual(docs, [docId1], 'should list doc ids');
      }

      {
        await session.addCategoryRecord(
          ContextCategories.Collection,
          collectionId,
          [docId2]
        );

        const docs = session.collections.flatMap(l => l.docs.map(d => d.id));
        t.deepEqual(docs, [docId1, docId2], 'should list doc ids');
      }

      await session.removeCategoryRecord(
        ContextCategories.Collection,
        collectionId
      );
      t.deepEqual(session.collections, [], 'should remove collection id');
    }
  }
});

// ==================== workspace embedding ====================
test('should be able to manage workspace embedding', async t => {
  const { db, jobs, workspace, workspaceEmbedding, context, prompt, session } =
    t.context;

  // use mocked embedding client
  Sinon.stub(context, 'embeddingClient').get(() => new MockEmbeddingClient());
  Sinon.stub(jobs, 'embeddingClient').get(() => new MockEmbeddingClient());

  const ws = await workspace.create(userId);

  // should create workspace embedding
  {
    const { blobId, file } = await workspaceEmbedding.addFile(userId, ws.id, {
      filename: 'test.txt',
      mimetype: 'text/plain',
      encoding: 'utf-8',
      createReadStream: () => {
        return new Readable({
          read() {
            this.push(Buffer.from('content'));
            this.push(null);
          },
        });
      },
    });
    await workspaceEmbedding.queueFileEmbedding({
      userId,
      workspaceId: ws.id,
      blobId,
      fileId: file.fileId,
      fileName: file.fileName,
    });

    let ret = 0;
    while (!ret) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      ret = await db.aiWorkspaceFileEmbedding.count({
        where: { workspaceId: ws.id, fileId: file.fileId },
      });
    }
  }

  // should create workspace embedding with file
  {
    await prompt.set(promptName, 'model', [
      { role: 'system', content: 'hello {{word}}' },
    ]);
    const sessionId = await session.create({
      docId: 'test',
      workspaceId: ws.id,
      userId,
      promptName,
      pinned: false,
    });
    const contextSession = await context.create(sessionId);

    const ret = await contextSession.matchFiles('test', 1, undefined, 1);
    t.is(ret.length, 1, 'should match workspace context');
    t.is(ret[0].content, 'content', 'should match content');

    await workspace.update(ws.id, { enableDocEmbedding: false });

    const ret2 = await contextSession.matchFiles('test', 1, undefined, 1);
    t.is(ret2.length, 0, 'should not match workspace context');
  }
});

test('should handle generateSessionTitle correctly under various conditions', async t => {
  const { prompt, session, promptRuntime, workspace, copilotSession } =
    t.context;

  await prompt.set(promptName, 'model', [
    { role: 'user', content: '{{content}}' },
  ]);
  const createSession = async (
    options: {
      userMessage?: string;
      assistantMessage?: string;
      existingTitle?: string;
    } = {}
  ) => {
    const ws = await workspace.create(userId);
    const sessionId = await session.create({
      docId: 'test-doc',
      workspaceId: ws.id,
      userId,
      promptName,
      pinned: false,
    });

    if (options.existingTitle) {
      await copilotSession.update({
        userId,
        sessionId,
        title: options.existingTitle,
      });
    }

    const chatSession = await session.get(sessionId);
    if (chatSession) {
      if (options.userMessage) {
        chatSession.pushTurn(
          buildTurn(sessionId, {
            role: 'user',
            content: options.userMessage,
            createdAt: new Date(),
          })
        );
      }
      if (options.assistantMessage) {
        chatSession.pushTurn(
          buildTurn(sessionId, {
            role: 'assistant',
            content: options.assistantMessage,
            createdAt: new Date(),
          })
        );
      }
      await chatSession.save();
    }

    return sessionId;
  };

  const testCases = [
    {
      name: 'should generate title when conditions are met',
      setup: () =>
        createSession({
          userMessage: 'What is machine learning?',
          assistantMessage:
            'Machine learning is a subset of artificial intelligence.',
        }),
      mockFn: () => 'What is Machine Learning?',
      expectSnapshot: true,
    },
    {
      name: 'should not generate title when session already has title',
      setup: () =>
        createSession({
          userMessage: 'Test message',
          assistantMessage: 'Test response',
          existingTitle: 'Existing Title',
        }),
      mockFn: () => 'New Title',
      expectSnapshot: true,
      expectNotCalled: true,
    },
    {
      name: 'should not generate title when no user messages exist',
      setup: () =>
        createSession({ assistantMessage: 'Hello! How can I help you?' }),
      mockFn: () => 'New Title',
      expectSnapshot: true,
      expectNotCalled: true,
    },
    {
      name: 'should not generate title when no assistant messages exist',
      setup: () => createSession({ userMessage: 'What is AI?' }),
      mockFn: () => 'New Title',
      expectSnapshot: true,
      expectNotCalled: true,
    },
    {
      name: 'should handle errors gracefully',
      setup: () =>
        createSession({
          userMessage: 'Test question',
          assistantMessage: 'Test answer',
        }),
      mockFn: () => {
        throw new Error('Mock error for testing');
      },
      expectError: 'Mock error for testing',
    },
  ];

  for (const testCase of testCases) {
    const sessionId = await testCase.setup();
    let chatWithPromptCalled = false;

    const mockStub = Sinon.stub(promptRuntime, 'runText').callsFake(
      async () => {
        chatWithPromptCalled = true;
        return testCase.mockFn();
      }
    );

    if (testCase.expectError) {
      await t.throwsAsync(
        () => session.generateSessionTitle({ sessionId }),
        { message: testCase.expectError },
        testCase.name
      );
    } else {
      await session.generateSessionTitle({ sessionId });

      if (testCase.expectSnapshot) {
        const sessionState = await session.getState(sessionId);
        t.snapshot(
          {
            chatWithPromptCalled: testCase.expectNotCalled
              ? chatWithPromptCalled
              : undefined,
            title: sessionState?.conversation.title,
            exists: !!sessionState,
          },
          testCase.name
        );
      }
    }

    mockStub.restore();
  }

  {
    const sessionId = await createSession({
      userMessage: 'Explain quantum computing briefly',
      assistantMessage: 'Quantum computing uses quantum mechanics principles.',
    });

    let capturedArgs: any[] = [];
    Sinon.stub(promptRuntime, 'runText').callsFake(async (...args) => {
      capturedArgs = args;
      return 'Quantum Computing Explained';
    });

    await session.generateSessionTitle({ sessionId });

    t.snapshot(
      {
        promptName: capturedArgs[0],
        content: capturedArgs[1]?.content,
      },
      'should use correct prompt for title generation'
    );
  }
});

test('should handle copilot cron jobs correctly', async t => {
  const { cronJobs, copilotSession } = t.context;

  // mock calls
  const mockCleanupResult = { removed: 2, cleaned: 3 };
  const mockSessions = [
    { id: 'session1', _count: { messages: 1 } },
    { id: 'session2', _count: { messages: 2 } },
  ];
  const cleanupStub = Sinon.stub(
    copilotSession,
    'cleanupEmptySessions'
  ).resolves(mockCleanupResult);
  const toBeGenerateStub = Sinon.stub(
    copilotSession,
    'toBeGenerateTitle'
  ).resolves(mockSessions);
  const jobAddStub = Sinon.stub(cronJobs['jobs'], 'add').resolves();

  // daily cleanup job scheduling
  {
    await cronJobs.dailyCleanupJob();
    t.snapshot(
      jobAddStub.getCalls().map(call => ({
        args: call.args,
      })),
      'daily job scheduling calls'
    );

    jobAddStub.reset();
    cleanupStub.reset();
    toBeGenerateStub.reset();
  }

  // cleanup empty sessions
  {
    // mock
    cleanupStub.resolves(mockCleanupResult);
    toBeGenerateStub.resolves(mockSessions);

    await cronJobs.cleanupEmptySessions();
    t.snapshot(
      cleanupStub.getCalls().map(call => ({
        args: call.args.map(arg => (arg instanceof Date ? 'Date' : arg)), // Replace Date with string for stable snapshot
      })),
      'cleanup empty sessions calls'
    );
  }

  // generate missing titles
  await cronJobs.generateMissingTitles();
  t.snapshot(
    {
      modelCalls: toBeGenerateStub.getCalls().map(call => ({
        args: call.args,
      })),
      jobCalls: jobAddStub.getCalls().map(call => ({
        args: call.args,
      })),
    },
    'title generation calls'
  );

  cleanupStub.restore();
  toBeGenerateStub.restore();
  jobAddStub.restore();
});

test('model selection policy should resolve requested optional models consistently', async t => {
  const { module } = t.context;
  const modelSelection = module.get(ModelSelectionPolicy);

  t.deepEqual(
    modelSelection.resolveRequestedModel({
      defaultModel: 'gemini-2.5-flash',
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
      requestedModelId: 'gemini-2.5-pro',
    }),
    {
      selectedModel: 'gemini-2.5-pro',
      matchedOptionalModel: true,
    }
  );

  t.deepEqual(
    modelSelection.resolveRequestedModel({
      defaultModel: 'gemini-2.5-flash',
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
      requestedModelId: 'openai-default/gemini-2.5-pro',
    }),
    {
      selectedModel: 'openai-default/gemini-2.5-pro',
      matchedOptionalModel: true,
    }
  );

  t.deepEqual(
    modelSelection.resolveRequestedModel({
      defaultModel: 'gemini-2.5-flash',
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
      requestedModelId: 'not-in-optional',
    }),
    {
      selectedModel: 'gemini-2.5-flash',
      matchedOptionalModel: false,
    }
  );

  t.is(
    modelSelection.resolveRequestedModel({
      defaultModel: 'gemini-2.5-flash',
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
      requestedModelId: 'not-in-optional',
    }).selectedModel,
    'gemini-2.5-flash'
  );
});

test('capability policy host should gate pro model requests by subscription status', async t => {
  const { quotaState, subscription, module } = t.context;
  const capabilityPolicy = module.get(CapabilityPolicyHost);

  const mockStatus = (status?: SubscriptionStatus) => {
    Sinon.restore();
    Sinon.stub(subscription, 'select').callsFake(() => ({
      // @ts-expect-error mock
      getSubscription: async () => (status ? { status } : null),
    }));
    Sinon.stub(quotaState, 'reconcileUserQuotaState').resolves({
      plan: status === SubscriptionStatus.Active ? 'pro' : 'free',
      flags: {},
    } as Awaited<ReturnType<QuotaStateService['reconcileUserQuotaState']>>);
  };

  // payment disabled -> allow requested if in optional; pro not blocked
  {
    const model1 = await capabilityPolicy.resolveChatModel({
      userId,
      defaultModel: 'gemini-2.5-flash',
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
      proModels: ['gemini-2.5-pro', 'claude-sonnet-4-5@20250929'],
      requestedModelId: 'gemini-2.5-pro',
      paymentEnabled: false,
    });
    t.snapshot(model1, 'should honor requested pro model');

    const model1WithPrefix = await capabilityPolicy.resolveChatModel({
      userId,
      defaultModel: 'gemini-2.5-flash',
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
      proModels: ['gemini-2.5-pro', 'claude-sonnet-4-5@20250929'],
      requestedModelId: 'openai-default/gemini-2.5-pro',
      paymentEnabled: false,
    });
    t.is(
      model1WithPrefix,
      'openai-default/gemini-2.5-pro',
      'should honor requested prefixed pro model'
    );

    const model2 = await capabilityPolicy.resolveChatModel({
      userId,
      defaultModel: 'gemini-2.5-flash',
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
      proModels: ['gemini-2.5-pro', 'claude-sonnet-4-5@20250929'],
      requestedModelId: 'not-in-optional',
      paymentEnabled: false,
    });
    t.snapshot(model2, 'should fallback to default model');
  }

  // payment enabled + trialing: requesting pro should fallback to default
  {
    mockStatus(SubscriptionStatus.Trialing);
    const model3 = await capabilityPolicy.resolveChatModel({
      userId,
      defaultModel: 'gemini-2.5-flash',
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
      proModels: ['gemini-2.5-pro', 'claude-sonnet-4-5@20250929'],
      requestedModelId: 'gemini-2.5-pro',
      paymentEnabled: true,
    });
    t.snapshot(
      model3,
      'should fallback to default model when requesting pro model during trialing'
    );

    const model3WithPrefix = await capabilityPolicy.resolveChatModel({
      userId,
      defaultModel: 'gemini-2.5-flash',
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
      proModels: ['gemini-2.5-pro', 'claude-sonnet-4-5@20250929'],
      requestedModelId: 'openai-default/gemini-2.5-pro',
      paymentEnabled: true,
    });
    t.is(
      model3WithPrefix,
      'gemini-2.5-flash',
      'should fallback to default model when requesting prefixed pro model during trialing'
    );

    const model4 = await capabilityPolicy.resolveChatModel({
      userId,
      defaultModel: 'gemini-2.5-flash',
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
      proModels: ['gemini-2.5-pro', 'claude-sonnet-4-5@20250929'],
      requestedModelId: 'gemini-2.5-flash',
      paymentEnabled: true,
    });
    t.snapshot(model4, 'should honor requested non-pro model during trialing');

    const model5 = await capabilityPolicy.resolveChatModel({
      userId,
      defaultModel: 'gemini-2.5-flash',
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
      proModels: ['gemini-2.5-pro', 'claude-sonnet-4-5@20250929'],
      paymentEnabled: true,
    });
    t.snapshot(
      model5,
      'should pick default model when no requested model during trialing'
    );
  }

  // payment enabled + active: without requested -> default model; requested pro should be honored
  {
    mockStatus(SubscriptionStatus.Active);
    const model6 = await capabilityPolicy.resolveChatModel({
      userId,
      defaultModel: 'gemini-2.5-flash',
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
      proModels: ['gemini-2.5-pro', 'claude-sonnet-4-5@20250929'],
      paymentEnabled: true,
    });
    t.snapshot(
      model6,
      'should pick default model when no requested model during active'
    );

    const model7 = await capabilityPolicy.resolveChatModel({
      userId,
      defaultModel: 'gemini-2.5-flash',
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
      proModels: ['gemini-2.5-pro', 'claude-sonnet-4-5@20250929'],
      requestedModelId: 'claude-sonnet-4-5@20250929',
      paymentEnabled: true,
    });
    t.snapshot(model7, 'should honor requested pro model during active');

    const model7WithPrefix = await capabilityPolicy.resolveChatModel({
      userId,
      defaultModel: 'gemini-2.5-flash',
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
      proModels: ['gemini-2.5-pro', 'claude-sonnet-4-5@20250929'],
      requestedModelId: 'openai-default/claude-sonnet-4-5@20250929',
      paymentEnabled: true,
    });
    t.is(
      model7WithPrefix,
      'openai-default/claude-sonnet-4-5@20250929',
      'should honor requested prefixed pro model during active'
    );

    const model8 = await capabilityPolicy.resolveChatModel({
      userId,
      defaultModel: 'gemini-2.5-flash',
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
      proModels: ['gemini-2.5-pro', 'claude-sonnet-4-5@20250929'],
      requestedModelId: 'not-in-optional',
      paymentEnabled: true,
    });
    t.snapshot(
      model8,
      'should fallback to default model when requesting non-optional model during active'
    );
  }
});

test('prompt runtime should resolve prefixed optional models consistently', async t => {
  const { prompt, promptRuntime, chatRuntime } = t.context;

  const promptName = randomUUID().replaceAll('-', '');
  await prompt.set(
    promptName,
    'gemini-2.5-flash',
    [{ role: 'user', content: '{{content}}' }],
    { proModels: ['gemini-2.5-pro'] },
    { optionalModels: ['gemini-2.5-pro'] }
  );

  const textStub = Sinon.stub(chatRuntime, 'text').resolves('ok');

  await promptRuntime.runText(
    promptName,
    { content: 'hello' },
    { modelId: 'openai-default/gemini-2.5-pro' }
  );
  t.is(
    textStub.firstCall.args[0].modelId,
    'openai-default/gemini-2.5-pro',
    'should preserve accepted provider-prefixed optional model'
  );

  await promptRuntime.runText(
    promptName,
    { content: 'hello' },
    { modelId: 'openai-default/not-in-optional' }
  );
  t.is(
    textStub.secondCall.args[0].modelId,
    'gemini-2.5-flash',
    'should fallback to default model for non-optional prefixed model'
  );
});

test('resolver models should use resolved provider metadata for display names', async t => {
  const { prompt, factory, module } = t.context;
  const resolver = module.get(CopilotResolver);

  const promptName = randomUUID().replaceAll('-', '');
  await prompt.set(
    promptName,
    'gemini-2.5-flash',
    [{ role: 'system', content: 'test' }],
    { proModels: ['gemini-2.5-pro'] },
    { optionalModels: ['gemini-2.5-flash', 'gemini-2.5-pro'] }
  );

  const resolveProvider = Sinon.stub(factory, 'resolveProvider').callsFake(
    async cond =>
      ({
        providerId: 'openai-default',
        rawModelId: cond.modelId,
        modelId: cond.modelId,
        profile: {
          id: 'openai-default',
          type: CopilotProviderType.OpenAI,
          enabled: true,
          priority: 10,
          config: {},
          middleware: {},
        },
        provider: {
          resolveModel: (modelId: string) => ({
            id: modelId,
            name: `Resolved ${modelId}`,
          }),
        },
      }) as any
  );

  const models = await resolver.models(promptName);

  t.deepEqual(models.optionalModels, [
    { id: 'gemini-2.5-flash', name: 'Resolved gemini-2.5-flash' },
    { id: 'gemini-2.5-pro', name: 'Resolved gemini-2.5-pro' },
  ]);
  t.deepEqual(models.proModels, [
    { id: 'gemini-2.5-pro', name: 'Resolved gemini-2.5-pro' },
  ]);
  t.true(
    resolveProvider.alwaysCalledWithMatch({
      outputType: ModelOutputType.Text,
    })
  );
});
