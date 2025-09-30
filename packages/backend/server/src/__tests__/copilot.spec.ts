import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { ProjectRoot } from '@affine-tools/utils/path';
import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';
import { nanoid } from 'nanoid';
import Sinon from 'sinon';

import { EventBus, JobQueue } from '../base';
import { ConfigModule } from '../base/config';
import { AuthService } from '../core/auth';
import { QuotaModule } from '../core/quota';
import { StorageModule, WorkspaceBlobStorage } from '../core/storage';
import {
  ContextCategories,
  CopilotSessionModel,
  WorkspaceModel,
} from '../models';
import { CopilotModule } from '../plugins/copilot';
import { CopilotContextService } from '../plugins/copilot/context';
import { CopilotCronJobs } from '../plugins/copilot/cron';
import {
  CopilotEmbeddingJob,
  MockEmbeddingClient,
} from '../plugins/copilot/embedding';
import { prompts, PromptService } from '../plugins/copilot/prompt';
import {
  CopilotProviderFactory,
  CopilotProviderType,
  ModelInputType,
  ModelOutputType,
  OpenAIProvider,
} from '../plugins/copilot/providers';
import {
  CitationParser,
  TextStreamParser,
} from '../plugins/copilot/providers/utils';
import { ChatSessionService } from '../plugins/copilot/session';
import { CopilotStorage } from '../plugins/copilot/storage';
import { CopilotTranscriptionService } from '../plugins/copilot/transcript';
import {
  CopilotChatTextExecutor,
  CopilotWorkflowService,
  GraphExecutorState,
  type WorkflowGraph,
  WorkflowGraphExecutor,
  type WorkflowNodeData,
  WorkflowNodeType,
} from '../plugins/copilot/workflow';
import {
  CopilotChatImageExecutor,
  CopilotCheckHtmlExecutor,
  CopilotCheckJsonExecutor,
  getWorkflowExecutor,
  NodeExecuteState,
  NodeExecutorType,
} from '../plugins/copilot/workflow/executor';
import { AutoRegisteredWorkflowExecutor } from '../plugins/copilot/workflow/executor/utils';
import { WorkflowGraphList } from '../plugins/copilot/workflow/graph';
import { CopilotWorkspaceService } from '../plugins/copilot/workspace';
import { PaymentModule } from '../plugins/payment';
import { SubscriptionService } from '../plugins/payment/service';
import { SubscriptionStatus } from '../plugins/payment/types';
import { MockCopilotProvider } from './mocks';
import { createTestingModule, TestingModule } from './utils';
import { WorkflowTestCases } from './utils/copilot';

type Context = {
  auth: AuthService;
  module: TestingModule;
  db: PrismaClient;
  event: EventBus;
  workspace: WorkspaceModel;
  workspaceStorage: WorkspaceBlobStorage;
  copilotSession: CopilotSessionModel;
  context: CopilotContextService;
  prompt: PromptService;
  transcript: CopilotTranscriptionService;
  workspaceEmbedding: CopilotWorkspaceService;
  factory: CopilotProviderFactory;
  session: ChatSessionService;
  jobs: CopilotEmbeddingJob;
  storage: CopilotStorage;
  workflow: CopilotWorkflowService;
  cronJobs: CopilotCronJobs;
  subscription: SubscriptionService;
  executors: {
    image: CopilotChatImageExecutor;
    text: CopilotChatTextExecutor;
    html: CopilotCheckHtmlExecutor;
    json: CopilotCheckJsonExecutor;
  };
};
const test = ava as TestFn<Context>;
let userId: string;

test.before(async t => {
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
            perplexity: {
              apiKey: process.env.COPILOT_PERPLEXITY_API_KEY ?? '1',
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
  const workspace = module.get(WorkspaceModel);
  const workspaceStorage = module.get(WorkspaceBlobStorage);
  const copilotSession = module.get(CopilotSessionModel);
  const prompt = module.get(PromptService);
  const factory = module.get(CopilotProviderFactory);

  const session = module.get(ChatSessionService);
  const workflow = module.get(CopilotWorkflowService);
  const storage = module.get(CopilotStorage);

  const context = module.get(CopilotContextService);
  const jobs = module.get(CopilotEmbeddingJob);
  const transcript = module.get(CopilotTranscriptionService);
  const workspaceEmbedding = module.get(CopilotWorkspaceService);
  const cronJobs = module.get(CopilotCronJobs);
  const subscription = module.get(SubscriptionService);

  t.context.module = module;
  t.context.auth = auth;
  t.context.db = db;
  t.context.event = event;
  t.context.workspace = workspace;
  t.context.workspaceStorage = workspaceStorage;
  t.context.copilotSession = copilotSession;
  t.context.prompt = prompt;
  t.context.factory = factory;
  t.context.session = session;
  t.context.workflow = workflow;
  t.context.storage = storage;
  t.context.context = context;
  t.context.jobs = jobs;
  t.context.transcript = transcript;
  t.context.workspaceEmbedding = workspaceEmbedding;
  t.context.cronJobs = cronJobs;
  t.context.subscription = subscription;

  t.context.executors = {
    image: module.get(CopilotChatImageExecutor),
    text: module.get(CopilotChatTextExecutor),
    html: module.get(CopilotCheckHtmlExecutor),
    json: module.get(CopilotCheckJsonExecutor),
  };

  await module.initTestingDB();
});

let promptName = 'prompt';

test.beforeEach(async t => {
  Sinon.restore();
  const { auth, prompt } = t.context;
  await prompt.onApplicationBootstrap();
  const user = await auth.signUp(`test-${randomUUID()}@affine.pro`, '123456');
  userId = user.id;
  promptName = randomUUID().replaceAll('-', '');
});

test.after.always(async t => {
  await t.context.module.close();
});

// ==================== prompt ====================

test('should be able to manage prompt', async t => {
  const { prompt } = t.context;

  const internalPromptCount = (await prompt.listNames()).length;
  t.is(internalPromptCount, prompts.length, 'should list names');

  await prompt.set(promptName, 'test', [
    { role: 'system', content: 'hello' },
    { role: 'user', content: 'hello' },
  ]);
  t.is(
    (await prompt.listNames()).length,
    internalPromptCount + 1,
    'should have one prompt'
  );
  t.is(
    (await prompt.get(promptName))!.finish({}).length,
    2,
    'should have two messages'
  );

  await prompt.update(promptName, {
    messages: [{ role: 'system', content: 'hello' }],
  });
  t.is(
    (await prompt.get(promptName))!.finish({}).length,
    1,
    'should have one message'
  );

  await prompt.delete(promptName);
  t.is(
    (await prompt.listNames()).length,
    internalPromptCount,
    'should be delete prompt'
  );
  t.is(await prompt.get(promptName), null, 'should not have the prompt');
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
    testPrompt?.finish(params).pop()?.content,
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
  t.deepEqual(testPrompt?.finish({ src_language: 'abc' }), [
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
    testPrompt?.finish(params).pop()?.content,
    'links:\n- https://affine.pro\n- https://github.com/toeverything/affine\n',
    'should render the prompt'
  );
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

  const cleanObject = (obj: any[]) =>
    JSON.parse(
      JSON.stringify(obj, (k, v) =>
        ['id', 'attachments', 'createdAt'].includes(k) ||
        v === null ||
        (typeof v === 'object' && !Object.keys(v).length)
          ? undefined
          : v
      )
    );

  s.push({ role: 'user', content: 'hello', createdAt: new Date() });

  const finalMessages = cleanObject(s.finish(params));
  t.snapshot(finalMessages, 'should generate the final message');
  await s.save();

  const s1 = (await session.get(sessionId))!;
  t.deepEqual(
    cleanObject(s1.finish(params)),
    finalMessages,
    'should same as before message'
  );
  t.snapshot(
    cleanObject(s1.finish(params)),
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
  s.push({ role: 'user', content: 'hello', createdAt: new Date() });
  s.push({ role: 'assistant', content: 'world', createdAt: new Date() });
  s.push({ role: 'user', content: 'aaa', createdAt: new Date() });
  s.push({ role: 'assistant', content: 'bbb', createdAt: new Date() });
  await s.save();

  // fork session
  const s1 = (await session.get(sessionId))!;
  // @ts-expect-error find maybe return undefined
  const latestMessageId = s1.finish({}).find(m => m.role === 'assistant')!.id;
  const forkedSessionId1 = await session.fork({
    userId,
    sessionId,
    latestMessageId,
    ...commonParams,
  });
  t.not(sessionId, forkedSessionId1, 'should fork a new session');

  const newUser = await auth.signUp('darksky.1@affine.pro', '123456');
  const forkedSessionId2 = await session.fork({
    userId: newUser.id,
    sessionId,
    latestMessageId,
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

  const cleanObject = (obj: any[]) =>
    JSON.parse(
      JSON.stringify(obj, (k, v) =>
        ['id', 'createdAt'].includes(k) || v === null ? undefined : v
      )
    );

  // check forked session messages
  {
    const s2 = (await session.get(forkedSessionId1))!;

    const finalMessages = s2.finish(params);
    t.snapshot(cleanObject(finalMessages), 'should generate the final message');
  }

  // check second times forked session
  {
    const s2 = (await session.get(forkedSessionId2))!;

    // should overwrite user id
    t.is(s2.config.userId, newUser.id, 'should have same user id');

    const finalMessages = s2.finish(params);
    t.snapshot(cleanObject(finalMessages), 'should generate the final message');
  }

  // check third times forked session
  {
    const s3 = (await session.get(forkedSessionId3))!;
    const finalMessages = s3.finish(params);
    t.snapshot(cleanObject(finalMessages), 'should generate the final message');
  }

  // check original session messages
  {
    const s4 = (await session.get(sessionId))!;
    const finalMessages = s4.finish(params);
    t.snapshot(cleanObject(finalMessages), 'should generate the final message');
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

test('should be able to process message id', async t => {
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

  const textMessage = await session.createMessage({
    sessionId,
    content: 'hello',
  });
  const anotherSessionMessage = await session.createMessage({
    sessionId: 'another-session-id',
  });

  await t.notThrowsAsync(
    s.pushByMessageId(textMessage),
    'should push by message id'
  );
  await t.throwsAsync(
    s.pushByMessageId(anotherSessionMessage),
    {
      instanceOf: Error,
    },
    'should throw error if push by another session message id'
  );
  await t.throwsAsync(
    s.pushByMessageId('invalid'),
    { instanceOf: Error },
    'should throw error if push by invalid message id'
  );
});

test('should be able to generate with message id', async t => {
  const { prompt, session } = t.context;

  await prompt.set(promptName, 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  // text message
  {
    const sessionId = await session.create({
      docId: 'test',
      workspaceId: 'test',
      userId,
      promptName,
      pinned: false,
    });
    const s = (await session.get(sessionId))!;

    const message = await session.createMessage({
      sessionId,
      content: 'hello',
    });

    await s.pushByMessageId(message);
    const finalMessages = s
      .finish({ word: 'world' })
      .map(({ content }) => content);
    t.deepEqual(finalMessages, ['hello world', 'hello']);
  }

  // attachment message
  {
    const sessionId = await session.create({
      docId: 'test',
      workspaceId: 'test',
      userId,
      promptName,
      pinned: false,
    });
    const s = (await session.get(sessionId))!;

    const message = await session.createMessage({
      sessionId,
      attachments: ['https://affine.pro/example.jpg'],
    });

    await s.pushByMessageId(message);
    const finalMessages = s
      .finish({ word: 'world' })
      .map(({ attachments }) => attachments);
    t.deepEqual(finalMessages, [
      // system prompt
      undefined,
      // user prompt
      ['https://affine.pro/example.jpg'],
    ]);
  }

  // empty message
  {
    const sessionId = await session.create({
      docId: 'test',
      workspaceId: 'test',
      userId,
      promptName,
      pinned: false,
    });
    const s = (await session.get(sessionId))!;

    const message = await session.createMessage({
      sessionId,
    });

    await s.pushByMessageId(message);
    const finalMessages = s
      .finish({ word: 'world' })
      .map(({ content }) => content);
    // empty message should be filtered
    t.deepEqual(finalMessages, ['hello world']);
  }
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

  const message = await session.createMessage({
    sessionId,
    content: 'hello',
  });

  await s.pushByMessageId(message);
  t.is(s.stashMessages.length, 1, 'should get stash messages');
  await s.save();
  t.is(s.stashMessages.length, 0, 'should empty stash messages after save');
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

    const message = await session.createMessage({
      sessionId,
      content: '1',
    });

    await s.pushByMessageId(message);
    await s.save();
  }

  const cleanObject = (obj: any[]) =>
    JSON.parse(
      JSON.stringify(obj, (k, v) =>
        ['id', 'createdAt'].includes(k) ||
        v === null ||
        (typeof v === 'object' && !Object.keys(v).length)
          ? undefined
          : v
      )
    );

  // check ChatSession behavior
  {
    const s = (await session.get(sessionId))!;
    s.push({ role: 'assistant', content: '2', createdAt: new Date() });
    s.push({ role: 'user', content: '3', createdAt: new Date() });
    s.push({ role: 'assistant', content: '4', createdAt: new Date() });
    await s.save();
    const beforeRevert = s.finish({ word: 'world' });
    t.snapshot(
      cleanObject(beforeRevert),
      'should have three messages before revert'
    );

    {
      s.revertLatestMessage(false);
      const afterRevert = s.finish({ word: 'world' });
      t.snapshot(
        cleanObject(afterRevert),
        'should remove assistant message after revert'
      );
    }

    {
      s.revertLatestMessage(true);
      const afterRevert = s.finish({ word: 'world' });
      t.snapshot(
        cleanObject(afterRevert),
        'should remove assistant message after revert'
      );
    }
  }

  // check database behavior
  {
    let s = (await session.get(sessionId))!;

    const beforeRevert = s.finish({ word: 'world' });
    t.snapshot(
      cleanObject(beforeRevert),
      'should have three messages before revert'
    );

    {
      await session.revertLatestMessage(sessionId, false);
      s = (await session.get(sessionId))!;
      const afterRevert = s.finish({ word: 'world' });
      t.snapshot(
        cleanObject(afterRevert),
        'should remove assistant message after revert'
      );
    }

    {
      await session.revertLatestMessage(sessionId, true);
      s = (await session.get(sessionId))!;
      const afterRevert = s.finish({ word: 'world' });
      t.snapshot(
        cleanObject(afterRevert),
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
    s.push({
      role: 'user',
      content: 'test message',
      params: { word: 'fromMessage' },
      createdAt: new Date(),
    });
    const messages = s.finish({});
    t.is(
      messages[0].content,
      'hello fromMessage',
      'should use params from last message'
    );
  }

  // Case 3: When neither params provided nor last message has params
  {
    s.push({
      role: 'user',
      content: 'test message without params',
      createdAt: new Date(),
    });
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

// ==================== workflow ====================

// this test used to preview the final result of the workflow
// for the functional test of the API itself, refer to the follow tests
test.skip('should be able to preview workflow', async t => {
  const { prompt, workflow, executors } = t.context;

  executors.text.register();

  for (const p of prompts) {
    await prompt.set(p.name, p.model, p.messages, p.config);
  }

  let result = '';
  for await (const ret of workflow.runGraph(
    { content: 'apple company' },
    'presentation'
  )) {
    if (ret.status === GraphExecutorState.EnterNode) {
      console.log('enter node:', ret.node.name);
    } else if (ret.status === GraphExecutorState.ExitNode) {
      console.log('exit node:', ret.node.name);
    } else if (ret.status === GraphExecutorState.EmitAttachment) {
      console.log('stream attachment:', ret);
    } else {
      result += ret.content;
      // console.log('stream result:', ret);
    }
  }
  console.log('final stream result:', result);
  t.truthy(result, 'should return result');
});

const runWorkflow = async function* runWorkflow(
  workflowService: CopilotWorkflowService,
  graph: WorkflowGraph,
  params: Record<string, string>
) {
  const instance = workflowService.initWorkflow(graph);
  const workflow = new WorkflowGraphExecutor(instance);
  for await (const result of workflow.runGraph(params)) {
    yield result;
  }
};

test('should be able to run pre defined workflow', async t => {
  const { prompt, workflow, executors } = t.context;

  executors.text.register();
  executors.html.register();
  executors.json.register();

  const executor = Sinon.spy(executors.text, 'next');

  for (const testCase of WorkflowTestCases) {
    const { graph, prompts, callCount, input, params, result } = testCase;
    console.log('running workflow test:', graph.name);
    for (const p of prompts) {
      await prompt.set(p.name, p.model, p.messages, p.config);
    }

    for (const [idx, i] of input.entries()) {
      let content: string | undefined = undefined;
      const param: any = Object.assign({ content: i }, params[idx]);
      for await (const ret of runWorkflow(workflow, graph!, param)) {
        if (ret.status === GraphExecutorState.EmitContent) {
          if (!content) content = '';
          content += ret.content;
        }
      }
      t.is(
        content,
        result[idx],
        `workflow ${graph.name} should generate correct text: ${result[idx]}`
      );
      t.is(
        executor.callCount,
        callCount[idx],
        `should call executor ${callCount} times`
      );

      // check run order
      for (const [idx, node] of graph!.graph
        .filter(g => g.nodeType === WorkflowNodeType.Basic)
        .entries()) {
        const params = executor.getCall(idx);
        t.is(params.args[0].id, node.id, 'graph id should correct');
      }
    }
  }
});

test('should be able to run workflow', async t => {
  const { workflow, executors } = t.context;

  executors.text.register();

  const executor = Sinon.spy(executors.text, 'next');

  const graphName = 'presentation';
  const graph = WorkflowGraphList.find(g => g.name === graphName);
  t.truthy(graph, `graph ${graphName} not defined`);

  // TODO(@darkskygit): use Array.fromAsync
  let result = '';
  for await (const ret of workflow.runGraph(
    { content: 'apple company' },
    graphName
  )) {
    if (ret.status === GraphExecutorState.EmitContent) {
      result += ret;
    }
  }
  t.assert(result, 'generate text to text stream');

  // presentation workflow has condition node, it will always false
  // so the latest 2 nodes will not be executed
  const callCount = graph!.graph.length - 2;
  t.is(
    executor.callCount,
    callCount,
    `should call executor ${callCount} times`
  );

  for (const [idx, node] of graph!.graph
    .filter(g => g.nodeType === WorkflowNodeType.Basic)
    .entries()) {
    const params = executor.getCall(idx);

    t.is(params.args[0].id, node.id, 'graph id should correct');

    t.is(
      params.args[1].content,
      'generate text to text stream',
      'graph params should correct'
    );
    t.is(
      params.args[1].language,
      'generate text to text',
      'graph params should correct'
    );
  }
});

// ==================== workflow executor ====================

const wrapAsyncIter = async <T>(iter: AsyncIterable<T>) => {
  const result: T[] = [];
  for await (const r of iter) {
    result.push(r);
  }
  return result;
};

test('should be able to run executor', async t => {
  const { executors } = t.context;

  const assertExecutor = async (proto: AutoRegisteredWorkflowExecutor) => {
    proto.register();
    const executor = getWorkflowExecutor(proto.type);
    t.is(executor.type, proto.type, 'should get executor');
    await t.throwsAsync(
      wrapAsyncIter(
        executor.next(
          { id: 'nope', name: 'nope', nodeType: WorkflowNodeType.Nope },
          {}
        )
      ),
      { instanceOf: Error },
      'should throw error if run non basic node'
    );
  };

  await assertExecutor(executors.image);
  await assertExecutor(executors.text);
});

test('should be able to run text executor', async t => {
  const { executors, factory, prompt } = t.context;

  executors.text.register();
  const executor = getWorkflowExecutor(executors.text.type);
  await prompt.set(promptName, 'test', [
    { role: 'system', content: 'hello {{word}}' },
  ]);
  // mock provider
  const testProvider = (await factory.getProviderByModel('test'))!;
  const text = Sinon.spy(testProvider, 'text');
  const textStream = Sinon.spy(testProvider, 'streamText');

  const nodeData: WorkflowNodeData = {
    id: 'basic',
    name: 'basic',
    nodeType: WorkflowNodeType.Basic,
    promptName,
    type: NodeExecutorType.ChatText,
  };

  // text
  {
    const ret = await wrapAsyncIter(
      executor.next({ ...nodeData, paramKey: 'key' }, { word: 'world' })
    );

    t.deepEqual(ret, [
      {
        type: NodeExecuteState.Params,
        params: { key: 'generate text to text' },
      },
    ]);
    t.deepEqual(
      text.lastCall.args[1][0].content,
      'hello world',
      'should render the prompt with params'
    );
  }

  // text stream with attachment
  {
    const ret = await wrapAsyncIter(
      executor.next(nodeData, {
        attachments: ['https://affine.pro/example.jpg'],
      })
    );

    t.deepEqual(
      ret,
      Array.from('generate text to text stream').map(t => ({
        content: t,
        nodeId: 'basic',
        type: NodeExecuteState.Content,
      }))
    );
    t.deepEqual(
      textStream.lastCall.args[1][0].params?.attachments,
      ['https://affine.pro/example.jpg'],
      'should pass attachments to provider'
    );
  }

  Sinon.restore();
});

test('should be able to run image executor', async t => {
  const { executors, factory, prompt } = t.context;

  executors.image.register();
  const executor = getWorkflowExecutor(executors.image.type);
  await prompt.set(promptName, 'test-image', [
    { role: 'user', content: 'tag1, tag2, tag3, {{#tags}}{{.}}, {{/tags}}' },
  ]);
  // mock provider
  const testProvider = (await factory.getProviderByModel('test'))!;

  const imageStream = Sinon.spy(testProvider, 'streamImages');

  const nodeData: WorkflowNodeData = {
    id: 'basic',
    name: 'basic',
    nodeType: WorkflowNodeType.Basic,
    promptName,
    type: NodeExecutorType.ChatText,
  };

  // image
  {
    const ret = await wrapAsyncIter(
      executor.next(
        { ...nodeData, paramKey: 'key' },
        { tags: ['tag4', 'tag5'] }
      )
    );

    t.snapshot(ret, 'should generate image stream');
    t.snapshot(
      imageStream.lastCall.args,
      'should render the prompt with params array'
    );
  }

  // image stream with attachment
  {
    const ret = await wrapAsyncIter(
      executor.next(nodeData, {
        attachments: ['https://affine.pro/example.jpg'],
      })
    );

    t.deepEqual(
      ret,
      Array.from([
        'https://example.com/test-image.jpg',
        'tag1, tag2, tag3, ',
      ]).map(t => ({
        attachment: t,
        nodeId: 'basic',
        type: NodeExecuteState.Attachment,
      }))
    );
    t.deepEqual(
      imageStream.lastCall.args[1][0].params?.attachments,
      ['https://affine.pro/example.jpg'],
      'should pass attachments to provider'
    );
  }

  Sinon.restore();
});

test('CitationParser should replace citation placeholders with URLs', t => {
  const content =
    'This is [a] test sentence with [citations [1]] and [[2]] and [3].';
  const citations = ['https://example1.com', 'https://example2.com'];

  const parser = new CitationParser();
  for (const citation of citations) {
    parser.push(citation);
  }

  const result = parser.parse(content) + parser.end();

  const expected = [
    'This is [a] test sentence with [citations [^1]] and [^2] and [3].',
    `[^1]: {"type":"url","url":"${encodeURIComponent(citations[0])}"}`,
    `[^2]: {"type":"url","url":"${encodeURIComponent(citations[1])}"}`,
  ].join('\n');

  t.is(result, expected);
});

test('CitationParser should replace chunks of citation placeholders with URLs', t => {
  const contents = [
    '[[]]',
    'This is [',
    'a] test sentence ',
    'with citations [1',
    '] and [',
    '[2]] and [[',
    '3]] and [[4',
    ']] and [[5]',
    '] and [[6]]',
    ' and [7',
  ];
  const citations = [
    'https://example1.com',
    'https://example2.com',
    'https://example3.com',
    'https://example4.com',
    'https://example5.com',
    'https://example6.com',
    'https://example7.com',
  ];

  const parser = new CitationParser();
  for (const citation of citations) {
    parser.push(citation);
  }

  let result = contents.reduce((acc, current) => {
    return acc + parser.parse(current);
  }, '');
  result += parser.end();

  const expected = [
    '[[]]This is [a] test sentence with citations [^1] and [^2] and [^3] and [^4] and [^5] and [^6] and [7',
    `[^1]: {"type":"url","url":"${encodeURIComponent(citations[0])}"}`,
    `[^2]: {"type":"url","url":"${encodeURIComponent(citations[1])}"}`,
    `[^3]: {"type":"url","url":"${encodeURIComponent(citations[2])}"}`,
    `[^4]: {"type":"url","url":"${encodeURIComponent(citations[3])}"}`,
    `[^5]: {"type":"url","url":"${encodeURIComponent(citations[4])}"}`,
    `[^6]: {"type":"url","url":"${encodeURIComponent(citations[5])}"}`,
    `[^7]: {"type":"url","url":"${encodeURIComponent(citations[6])}"}`,
  ].join('\n');
  t.is(result, expected);
});

test('CitationParser should not replace citation already with URLs', t => {
  const content =
    'This is [a] test sentence with citations [1](https://example1.com) and [[2]](https://example2.com) and [[3](https://example3.com)].';
  const citations = [
    'https://example4.com',
    'https://example5.com',
    'https://example6.com',
  ];

  const parser = new CitationParser();
  for (const citation of citations) {
    parser.push(citation);
  }

  const result = parser.parse(content) + parser.end();

  const expected = [
    content,
    `[^1]: {"type":"url","url":"${encodeURIComponent(citations[0])}"}`,
    `[^2]: {"type":"url","url":"${encodeURIComponent(citations[1])}"}`,
    `[^3]: {"type":"url","url":"${encodeURIComponent(citations[2])}"}`,
  ].join('\n');
  t.is(result, expected);
});

test('CitationParser should not replace chunks of citation already with URLs', t => {
  const contents = [
    'This is [a] test sentence with citations [1',
    '](https://example1.com) and [[2]',
    '](https://example2.com) and [[3](https://example3.com)].',
  ];
  const citations = [
    'https://example4.com',
    'https://example5.com',
    'https://example6.com',
  ];

  const parser = new CitationParser();
  for (const citation of citations) {
    parser.push(citation);
  }

  let result = contents.reduce((acc, current) => {
    return acc + parser.parse(current);
  }, '');
  result += parser.end();

  const expected = [
    contents.join(''),
    `[^1]: {"type":"url","url":"${encodeURIComponent(citations[0])}"}`,
    `[^2]: {"type":"url","url":"${encodeURIComponent(citations[1])}"}`,
    `[^3]: {"type":"url","url":"${encodeURIComponent(citations[2])}"}`,
  ].join('\n');
  t.is(result, expected);
});

test('CitationParser should replace openai style reference chunks', t => {
  const contents = [
    'This is [a] test sentence with citations ',
    '([example1.com](https://example1.com))',
  ];

  const parser = new CitationParser();

  let result = contents.reduce((acc, current) => {
    return acc + parser.parse(current);
  }, '');
  result += parser.end();

  const expected = [
    contents[0] + '[^1]',
    `[^1]: {"type":"url","url":"${encodeURIComponent('https://example1.com')}"}`,
  ].join('\n');
  t.is(result, expected);
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
  const { prompt, session, workspace, copilotSession } = t.context;

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
        chatSession.push({
          role: 'user',
          content: options.userMessage,
          createdAt: new Date(),
        });
      }
      if (options.assistantMessage) {
        chatSession.push({
          role: 'assistant',
          content: options.assistantMessage,
          createdAt: new Date(),
        });
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

    const mockStub = Sinon.stub(session, 'chatWithPrompt').callsFake(
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
        const sessionState = await session.getSessionInfo(sessionId);
        t.snapshot(
          {
            chatWithPromptCalled: testCase.expectNotCalled
              ? chatWithPromptCalled
              : undefined,
            title: sessionState?.title,
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
    Sinon.stub(session, 'chatWithPrompt').callsFake(async (...args) => {
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

test('should resolve model correctly based on subscription status and prompt config', async t => {
  const { db, session, subscription } = t.context;

  // 1) Seed a prompt that has optionalModels and proModels in config
  const promptName = 'resolve-model-test';
  await db.aiPrompt.create({
    data: {
      name: promptName,
      model: 'gemini-2.5-flash',
      messages: {
        create: [{ idx: 0, role: 'system', content: 'test' }],
      },
      config: { proModels: ['gemini-2.5-pro', 'claude-sonnet-4-5@20250929'] },
      optionalModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'claude-sonnet-4-5@20250929',
      ],
    },
  });

  // 2) Create a chat session with this prompt
  const sessionId = await session.create({
    promptName,
    docId: 'test',
    workspaceId: 'test',
    userId,
    pinned: false,
  });
  const s = (await session.get(sessionId))!;

  const mockStatus = (status?: SubscriptionStatus) => {
    Sinon.restore();
    Sinon.stub(subscription, 'select').callsFake(() => ({
      // @ts-expect-error mock
      getSubscription: async () => (status ? { status } : null),
    }));
  };

  // payment disabled -> allow requested if in optional; pro not blocked
  {
    const model1 = await s.resolveModel(false, 'gemini-2.5-pro');
    t.snapshot(model1, 'should honor requested pro model');

    const model2 = await s.resolveModel(false, 'not-in-optional');
    t.snapshot(model2, 'should fallback to default model');
  }

  // payment enabled + trialing: requesting pro should fallback to default
  {
    mockStatus(SubscriptionStatus.Trialing);
    const model3 = await s.resolveModel(true, 'gemini-2.5-pro');
    t.snapshot(
      model3,
      'should fallback to default model when requesting pro model during trialing'
    );

    const model4 = await s.resolveModel(true, 'gemini-2.5-flash');
    t.snapshot(model4, 'should honor requested non-pro model during trialing');

    const model5 = await s.resolveModel(true);
    t.snapshot(
      model5,
      'should pick default model when no requested model during trialing'
    );
  }

  // payment enabled + active: without requested -> default model; requested pro should be honored
  {
    mockStatus(SubscriptionStatus.Active);
    const model6 = await s.resolveModel(true);
    t.snapshot(
      model6,
      'should pick default model when no requested model during active'
    );

    const model7 = await s.resolveModel(true, 'claude-sonnet-4-5@20250929');
    t.snapshot(model7, 'should honor requested pro model during active');

    const model8 = await s.resolveModel(true, 'not-in-optional');
    t.snapshot(
      model8,
      'should fallback to default model when requesting non-optional model during active'
    );
  }
});
