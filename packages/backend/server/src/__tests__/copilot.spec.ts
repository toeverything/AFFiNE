import { randomUUID } from 'node:crypto';

import { ProjectRoot } from '@affine-tools/utils/path';
import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';
import Sinon from 'sinon';

import { EventBus } from '../base';
import { ConfigModule } from '../base/config';
import { AuthService } from '../core/auth';
import { QuotaModule } from '../core/quota';
import { ContextCategories } from '../models';
import { CopilotModule } from '../plugins/copilot';
import {
  CopilotContextDocJob,
  CopilotContextService,
} from '../plugins/copilot/context';
import { MockEmbeddingClient } from '../plugins/copilot/context/embedding';
import { prompts, PromptService } from '../plugins/copilot/prompt';
import {
  CopilotProviderService,
  OpenAIProvider,
  registerCopilotProvider,
  unregisterCopilotProvider,
} from '../plugins/copilot/providers';
import { CitationParser } from '../plugins/copilot/providers/perplexity';
import { ChatSessionService } from '../plugins/copilot/session';
import { CopilotStorage } from '../plugins/copilot/storage';
import {
  CopilotCapability,
  CopilotProviderType,
} from '../plugins/copilot/types';
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
import { createTestingModule, TestingModule } from './utils';
import { MockCopilotTestProvider, WorkflowTestCases } from './utils/copilot';

const test = ava as TestFn<{
  auth: AuthService;
  module: TestingModule;
  db: PrismaClient;
  event: EventBus;
  context: CopilotContextService;
  prompt: PromptService;
  provider: CopilotProviderService;
  session: ChatSessionService;
  jobs: CopilotContextDocJob;
  storage: CopilotStorage;
  workflow: CopilotWorkflowService;
  executors: {
    image: CopilotChatImageExecutor;
    text: CopilotChatTextExecutor;
    html: CopilotCheckHtmlExecutor;
    json: CopilotCheckJsonExecutor;
  };
}>;
let userId: string;

test.before(async t => {
  const module = await createTestingModule({
    imports: [
      ConfigModule.forRoot({
        plugins: {
          copilot: {
            openai: {
              apiKey: process.env.COPILOT_OPENAI_API_KEY ?? '1',
            },
            fal: {
              apiKey: process.env.COPILOT_FAL_API_KEY ?? '1',
            },
            perplexity: {
              apiKey: process.env.COPILOT_PERPLEXITY_API_KEY ?? '1',
            },
          },
        },
      }),
      QuotaModule,
      CopilotModule,
    ],
  });

  const auth = module.get(AuthService);
  const db = module.get(PrismaClient);
  const event = module.get(EventBus);
  const context = module.get(CopilotContextService);
  const prompt = module.get(PromptService);
  const provider = module.get(CopilotProviderService);
  const session = module.get(ChatSessionService);
  const workflow = module.get(CopilotWorkflowService);
  const jobs = module.get(CopilotContextDocJob);
  const storage = module.get(CopilotStorage);

  t.context.module = module;
  t.context.auth = auth;
  t.context.db = db;
  t.context.event = event;
  t.context.context = context;
  t.context.prompt = prompt;
  t.context.provider = provider;
  t.context.session = session;
  t.context.workflow = workflow;
  t.context.jobs = jobs;
  t.context.storage = storage;
  t.context.executors = {
    image: module.get(CopilotChatImageExecutor),
    text: module.get(CopilotChatTextExecutor),
    html: module.get(CopilotCheckHtmlExecutor),
    json: module.get(CopilotCheckJsonExecutor),
  };
});

test.beforeEach(async t => {
  Sinon.restore();
  const { module, auth, prompt } = t.context;
  await module.initTestingDB();
  await prompt.onModuleInit();
  const user = await auth.signUp('test@affine.pro', '123456');
  userId = user.id;
});

test.after.always(async t => {
  await t.context.module.close();
});

// ==================== prompt ====================

test('should be able to manage prompt', async t => {
  const { prompt } = t.context;

  const internalPromptCount = (await prompt.listNames()).length;
  t.is(internalPromptCount, prompts.length, 'should list names');

  await prompt.set('test', 'test', [
    { role: 'system', content: 'hello' },
    { role: 'user', content: 'hello' },
  ]);
  t.is(
    (await prompt.listNames()).length,
    internalPromptCount + 1,
    'should have one prompt'
  );
  t.is(
    (await prompt.get('test'))!.finish({}).length,
    2,
    'should have two messages'
  );

  await prompt.update('test', [{ role: 'system', content: 'hello' }]);
  t.is(
    (await prompt.get('test'))!.finish({}).length,
    1,
    'should have one message'
  );

  await prompt.delete('test');
  t.is(
    (await prompt.listNames()).length,
    internalPromptCount,
    'should be delete prompt'
  );
  t.is(await prompt.get('test'), null, 'should not have the prompt');
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

  await prompt.set('test', 'test', [msg]);
  const testPrompt = await prompt.get('test');
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

  await prompt.set('test', 'test', [msg]);
  const testPrompt = await prompt.get('test');

  t.is(
    testPrompt?.finish(params).pop()?.content,
    'links:\n- https://affine.pro\n- https://github.com/toeverything/affine\n',
    'should render the prompt'
  );
});

// ==================== session ====================

test('should be able to manage chat session', async t => {
  const { prompt, session } = t.context;

  await prompt.set('prompt', 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  const params = { word: 'world' };
  const commonParams = { docId: 'test', workspaceId: 'test' };

  const sessionId = await session.create({
    userId,
    promptName: 'prompt',
    ...commonParams,
  });
  t.truthy(sessionId, 'should create session');

  const s = (await session.get(sessionId))!;
  t.is(s.config.sessionId, sessionId, 'should get session');
  t.is(s.config.promptName, 'prompt', 'should have prompt name');
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
      promptName: 'prompt',
      ...commonParams,
    });
    t.is(newSessionId, sessionId, 'should get same session id');
  }
});

test('should be able to update chat session prompt', async t => {
  const { prompt, session } = t.context;

  // Set up a prompt to be used in the session
  await prompt.set('prompt', 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  // Create a session
  const sessionId = await session.create({
    promptName: 'prompt',
    docId: 'test',
    workspaceId: 'test',
    userId,
  });
  t.truthy(sessionId, 'should create session');

  // Update the session
  const updatedSessionId = await session.updateSessionPrompt({
    sessionId,
    promptName: 'Search With AFFiNE AI',
    userId,
  });
  t.is(updatedSessionId, sessionId, 'should update session with same id');

  // Verify the session was updated
  const updatedSession = await session.get(sessionId);
  t.truthy(updatedSession, 'should retrieve updated session');
  t.is(
    updatedSession?.config.promptName,
    'Search With AFFiNE AI',
    'should have updated prompt name'
  );
});

test('should be able to fork chat session', async t => {
  const { auth, prompt, session } = t.context;

  await prompt.set('prompt', 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  const params = { word: 'world' };
  const commonParams = { docId: 'test', workspaceId: 'test' };
  // create session
  const sessionId = await session.create({
    userId,
    promptName: 'prompt',
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
  // @ts-expect-error
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

  // check original session messages
  {
    const s3 = (await session.get(sessionId))!;

    const finalMessages = s3.finish(params);
    t.snapshot(cleanObject(finalMessages), 'should generate the final message');
  }

  // should get main session after fork if re-create a chat session for same docId and workspaceId
  {
    const newSessionId = await session.create({
      userId,
      promptName: 'prompt',
      ...commonParams,
    });
    t.is(newSessionId, sessionId, 'should get same session id');
  }
});

test('should be able to process message id', async t => {
  const { prompt, session } = t.context;

  await prompt.set('prompt', 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  const sessionId = await session.create({
    docId: 'test',
    workspaceId: 'test',
    userId,
    promptName: 'prompt',
  });
  const s = (await session.get(sessionId))!;

  const textMessage = (await session.createMessage({
    sessionId,
    content: 'hello',
  }))!;
  const anotherSessionMessage = (await session.createMessage({
    sessionId: 'another-session-id',
  }))!;

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

  await prompt.set('prompt', 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  // text message
  {
    const sessionId = await session.create({
      docId: 'test',
      workspaceId: 'test',
      userId,
      promptName: 'prompt',
    });
    const s = (await session.get(sessionId))!;

    const message = (await session.createMessage({
      sessionId,
      content: 'hello',
    }))!;

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
      promptName: 'prompt',
    });
    const s = (await session.get(sessionId))!;

    const message = (await session.createMessage({
      sessionId,
      attachments: ['https://affine.pro/example.jpg'],
    }))!;

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
      promptName: 'prompt',
    });
    const s = (await session.get(sessionId))!;

    const message = (await session.createMessage({
      sessionId,
    }))!;

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

  await prompt.set('prompt', 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  const sessionId = await session.create({
    docId: 'test',
    workspaceId: 'test',
    userId,
    promptName: 'prompt',
  });
  const s = (await session.get(sessionId))!;

  const message = (await session.createMessage({
    sessionId,
    content: 'hello',
  }))!;

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
    await prompt.set('prompt', 'model', [
      { role: 'system', content: 'hello {{word}}' },
    ]);

    sessionId = await session.create({
      docId: 'test',
      workspaceId: 'test',
      userId,
      promptName: 'prompt',
    });
    const s = (await session.get(sessionId))!;

    const message = (await session.createMessage({
      sessionId,
      content: '1',
    }))!;

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

  await prompt.set('prompt', 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);

  const sessionId = await session.create({
    docId: 'test',
    workspaceId: 'test',
    userId,
    promptName: 'prompt',
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
  const { provider } = t.context;

  {
    const p = await provider.getProviderByCapability(
      CopilotCapability.TextToText
    );
    t.is(
      p?.type.toString(),
      'openai',
      'should get provider support text-to-text'
    );
  }

  {
    const p = await provider.getProviderByCapability(
      CopilotCapability.TextToEmbedding
    );
    t.is(
      p?.type.toString(),
      'openai',
      'should get provider support text-to-embedding'
    );
  }

  {
    const p = await provider.getProviderByCapability(
      CopilotCapability.TextToImage
    );
    t.is(
      p?.type.toString(),
      'fal',
      'should get provider support text-to-image'
    );
  }

  {
    const p = await provider.getProviderByCapability(
      CopilotCapability.ImageToImage
    );
    t.is(
      p?.type.toString(),
      'fal',
      'should get provider support image-to-image'
    );
  }

  {
    const p = await provider.getProviderByCapability(
      CopilotCapability.ImageToText
    );
    t.is(
      p?.type.toString(),
      'fal',
      'should get provider support image-to-text'
    );
  }

  // text-to-image use fal by default, but this case can use
  // model dall-e-3 to select openai provider
  {
    const p = await provider.getProviderByCapability(
      CopilotCapability.TextToImage,
      'dall-e-3'
    );
    t.is(
      p?.type.toString(),
      'openai',
      'should get provider support text-to-image and model'
    );
  }

  // gpt4o is not defined now, but it already published by openai
  // we should check from online api if it is available
  {
    const p = await provider.getProviderByCapability(
      CopilotCapability.ImageToText,
      'gpt-4o-2024-08-06'
    );
    t.is(
      p?.type.toString(),
      'openai',
      'should get provider support text-to-image and model'
    );
  }

  // if a model is not defined and not available in online api
  // it should return null
  {
    const p = await provider.getProviderByCapability(
      CopilotCapability.ImageToText,
      'gpt-4-not-exist'
    );
    t.falsy(p, 'should not get provider');
  }
});

test('should be able to register test provider', async t => {
  const { provider } = t.context;
  registerCopilotProvider(MockCopilotTestProvider);

  const assertProvider = async (cap: CopilotCapability) => {
    const p = await provider.getProviderByCapability(cap, 'test');
    t.is(
      p?.type,
      CopilotProviderType.Test,
      `should get test provider with ${cap}`
    );
  };

  await assertProvider(CopilotCapability.TextToText);
  await assertProvider(CopilotCapability.TextToEmbedding);
  await assertProvider(CopilotCapability.TextToImage);
  await assertProvider(CopilotCapability.ImageToImage);
  await assertProvider(CopilotCapability.ImageToText);
});

// ==================== workflow ====================

// this test used to preview the final result of the workflow
// for the functional test of the API itself, refer to the follow tests
test.skip('should be able to preview workflow', async t => {
  const { prompt, workflow, executors } = t.context;

  executors.text.register();
  registerCopilotProvider(OpenAIProvider);

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

  unregisterCopilotProvider(OpenAIProvider.type);
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
  unregisterCopilotProvider(OpenAIProvider.type);
  registerCopilotProvider(MockCopilotTestProvider);

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

  unregisterCopilotProvider(MockCopilotTestProvider.type);
  registerCopilotProvider(OpenAIProvider);
});

test('should be able to run workflow', async t => {
  const { workflow, executors } = t.context;

  executors.text.register();
  unregisterCopilotProvider(OpenAIProvider.type);
  registerCopilotProvider(MockCopilotTestProvider);

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

  unregisterCopilotProvider(MockCopilotTestProvider.type);
  registerCopilotProvider(OpenAIProvider);
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
  const { executors, provider, prompt } = t.context;

  executors.text.register();
  const executor = getWorkflowExecutor(executors.text.type);
  unregisterCopilotProvider(OpenAIProvider.type);
  registerCopilotProvider(MockCopilotTestProvider);
  await prompt.set('test', 'test', [
    { role: 'system', content: 'hello {{word}}' },
  ]);
  // mock provider
  const testProvider =
    (await provider.getProviderByModel<CopilotCapability.TextToText>('test'))!;
  const text = Sinon.spy(testProvider, 'generateText');
  const textStream = Sinon.spy(testProvider, 'generateTextStream');

  const nodeData: WorkflowNodeData = {
    id: 'basic',
    name: 'basic',
    nodeType: WorkflowNodeType.Basic,
    promptName: 'test',
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
      text.lastCall.args[0][0].content,
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
      textStream.lastCall.args[0][0].params?.attachments,
      ['https://affine.pro/example.jpg'],
      'should pass attachments to provider'
    );
  }

  Sinon.restore();
  unregisterCopilotProvider(MockCopilotTestProvider.type);
  registerCopilotProvider(OpenAIProvider);
});

test('should be able to run image executor', async t => {
  const { executors, provider, prompt } = t.context;

  executors.image.register();
  const executor = getWorkflowExecutor(executors.image.type);
  unregisterCopilotProvider(OpenAIProvider.type);
  registerCopilotProvider(MockCopilotTestProvider);
  await prompt.set('test', 'test', [
    { role: 'user', content: 'tag1, tag2, tag3, {{#tags}}{{.}}, {{/tags}}' },
  ]);
  // mock provider
  const testProvider =
    (await provider.getProviderByModel<CopilotCapability.TextToImage>('test'))!;
  const image = Sinon.spy(testProvider, 'generateImages');
  const imageStream = Sinon.spy(testProvider, 'generateImagesStream');

  const nodeData: WorkflowNodeData = {
    id: 'basic',
    name: 'basic',
    nodeType: WorkflowNodeType.Basic,
    promptName: 'test',
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

    t.deepEqual(ret, [
      {
        type: NodeExecuteState.Params,
        params: {
          key: [
            'https://example.com/test.jpg',
            'tag1, tag2, tag3, tag4, tag5, ',
          ],
        },
      },
    ]);
    t.deepEqual(
      image.lastCall.args[0][0].content,
      'tag1, tag2, tag3, tag4, tag5, ',
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
      Array.from(['https://example.com/test.jpg', 'tag1, tag2, tag3, ']).map(
        t => ({
          attachment: t,
          nodeId: 'basic',
          type: NodeExecuteState.Attachment,
        })
      )
    );
    t.deepEqual(
      imageStream.lastCall.args[0][0].params?.attachments,
      ['https://affine.pro/example.jpg'],
      'should pass attachments to provider'
    );
  }

  Sinon.restore();
  unregisterCopilotProvider(MockCopilotTestProvider.type);
  registerCopilotProvider(OpenAIProvider);
});

test('CitationParser should replace citation placeholders with URLs', t => {
  const content =
    'This is [a] test sentence with [citations [1]] and [[2]] and [3].';
  const citations = ['https://example1.com', 'https://example2.com'];

  const parser = new CitationParser();
  const result = parser.parse(content, citations) + parser.end();

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
  let result = contents.reduce((acc, current) => {
    return acc + parser.parse(current, citations);
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
  const result = parser.parse(content, citations) + parser.end();

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
  let result = contents.reduce((acc, current) => {
    return acc + parser.parse(current, citations);
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

// ==================== context ====================
test('should be able to manage context', async t => {
  const { context, prompt, session, event, jobs, storage } = t.context;

  await prompt.set('prompt', 'model', [
    { role: 'system', content: 'hello {{word}}' },
  ]);
  const chatSession = await session.create({
    docId: 'test',
    workspaceId: 'test',
    userId,
    promptName: 'prompt',
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
      const file = await session.addFile('blob', 'sample.pdf');

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

      const result = await session.matchFileChunks('test', 1, undefined, 1);
      t.is(result.length, 1, 'should match context');
      t.is(result[0].fileId, file.id, 'should match file id');
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
