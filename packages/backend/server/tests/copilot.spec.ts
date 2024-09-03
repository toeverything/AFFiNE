/// <reference types="../src/global.d.ts" />

import { TestingModule } from '@nestjs/testing';
import type { TestFn } from 'ava';
import ava from 'ava';
import Sinon from 'sinon';

import { AuthService } from '../src/core/auth';
import { QuotaModule } from '../src/core/quota';
import { ConfigModule } from '../src/fundamentals/config';
import { CopilotModule } from '../src/plugins/copilot';
import { prompts, PromptService } from '../src/plugins/copilot/prompt';
import {
  CopilotProviderService,
  OpenAIProvider,
  registerCopilotProvider,
  unregisterCopilotProvider,
} from '../src/plugins/copilot/providers';
import { ChatSessionService } from '../src/plugins/copilot/session';
import {
  CopilotCapability,
  CopilotProviderType,
} from '../src/plugins/copilot/types';
import {
  CopilotChatTextExecutor,
  CopilotWorkflowService,
  GraphExecutorState,
  type WorkflowGraph,
  WorkflowGraphExecutor,
  type WorkflowNodeData,
  WorkflowNodeType,
} from '../src/plugins/copilot/workflow';
import {
  CopilotChatImageExecutor,
  CopilotCheckHtmlExecutor,
  CopilotCheckJsonExecutor,
  getWorkflowExecutor,
  NodeExecuteState,
  NodeExecutorType,
} from '../src/plugins/copilot/workflow/executor';
import { AutoRegisteredWorkflowExecutor } from '../src/plugins/copilot/workflow/executor/utils';
import { WorkflowGraphList } from '../src/plugins/copilot/workflow/graph';
import { createTestingModule } from './utils';
import { MockCopilotTestProvider, WorkflowTestCases } from './utils/copilot';

const test = ava as TestFn<{
  auth: AuthService;
  module: TestingModule;
  prompt: PromptService;
  provider: CopilotProviderService;
  session: ChatSessionService;
  workflow: CopilotWorkflowService;
  executors: {
    image: CopilotChatImageExecutor;
    text: CopilotChatTextExecutor;
    html: CopilotCheckHtmlExecutor;
    json: CopilotCheckJsonExecutor;
  };
}>;

test.beforeEach(async t => {
  const module = await createTestingModule({
    imports: [
      ConfigModule.forRoot({
        plugins: {
          copilot: {
            openai: {
              apiKey: process.env.COPILOT_OPENAI_API_KEY ?? '1',
            },
            fal: {
              apiKey: '1',
            },
          },
        },
      }),
      QuotaModule,
      CopilotModule,
    ],
  });

  const auth = module.get(AuthService);
  const prompt = module.get(PromptService);
  const provider = module.get(CopilotProviderService);
  const session = module.get(ChatSessionService);
  const workflow = module.get(CopilotWorkflowService);

  t.context.module = module;
  t.context.auth = auth;
  t.context.prompt = prompt;
  t.context.provider = provider;
  t.context.session = session;
  t.context.workflow = workflow;
  t.context.executors = {
    image: module.get(CopilotChatImageExecutor),
    text: module.get(CopilotChatTextExecutor),
    html: module.get(CopilotCheckHtmlExecutor),
    json: module.get(CopilotCheckJsonExecutor),
  };
});

test.afterEach.always(async t => {
  await t.context.module.close();
});

let userId: string;
test.beforeEach(async t => {
  const { auth } = t.context;
  const user = await auth.signUp('test@affine.pro', '123456');
  userId = user.id;
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

  s.push({ role: 'user', content: 'hello', createdAt: new Date() });
  // @ts-expect-error
  const finalMessages = s.finish(params).map(({ createdAt: _, ...m }) => m);
  t.deepEqual(
    finalMessages,
    [
      { content: 'hello world', params, role: 'system' },
      { content: 'hello', role: 'user' },
    ],
    'should generate the final message'
  );
  await s.save();

  const s1 = (await session.get(sessionId))!;
  t.deepEqual(
    s1
      .finish(params)
      // @ts-expect-error
      .map(({ id: _, attachments: __, createdAt: ___, ...m }) => m),
    finalMessages,
    'should same as before message'
  );
  t.deepEqual(
    // @ts-expect-error
    s1.finish({}).map(({ id: _, attachments: __, createdAt: ___, ...m }) => m),
    [
      { content: 'hello ', params: {}, role: 'system' },
      { content: 'hello', role: 'user' },
    ],
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

  // check forked session messages
  {
    const s2 = (await session.get(forkedSessionId1))!;

    const finalMessages = s2
      .finish(params) // @ts-expect-error
      .map(({ id: _, attachments: __, createdAt: ___, ...m }) => m);
    t.deepEqual(
      finalMessages,
      [
        { role: 'system', content: 'hello world', params },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' },
      ],
      'should generate the final message'
    );
  }

  // check second times forked session
  {
    const s2 = (await session.get(forkedSessionId2))!;

    // should overwrite user id
    t.is(s2.config.userId, newUser.id, 'should have same user id');

    const finalMessages = s2
      .finish(params) // @ts-expect-error
      .map(({ id: _, attachments: __, createdAt: ___, ...m }) => m);
    t.deepEqual(
      finalMessages,
      [
        { role: 'system', content: 'hello world', params },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' },
      ],
      'should generate the final message'
    );
  }

  // check original session messages
  {
    const s3 = (await session.get(sessionId))!;

    const finalMessages = s3
      .finish(params) // @ts-expect-error
      .map(({ id: _, attachments: __, createdAt: ___, ...m }) => m);
    t.deepEqual(
      finalMessages,
      [
        { role: 'system', content: 'hello world', params },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' },
        { role: 'user', content: 'aaa' },
        { role: 'assistant', content: 'bbb' },
      ],
      'should generate the final message'
    );
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
      content: 'hello',
    }))!;

    await s.pushByMessageId(message);
    await s.save();
  }

  // check ChatSession behavior
  {
    const s = (await session.get(sessionId))!;
    s.push({ role: 'assistant', content: 'hi', createdAt: new Date() });
    await s.save();
    const beforeRevert = s.finish({ word: 'world' });
    t.is(beforeRevert.length, 3, 'should have three messages before revert');

    s.revertLatestMessage();
    const afterRevert = s.finish({ word: 'world' });
    t.is(afterRevert.length, 2, 'should remove assistant message after revert');
  }

  // check database behavior
  {
    let s = (await session.get(sessionId))!;
    const beforeRevert = s.finish({ word: 'world' });
    t.is(beforeRevert.length, 3, 'should have three messages before revert');

    await session.revertLatestMessage(sessionId);
    s = (await session.get(sessionId))!;
    const afterRevert = s.finish({ word: 'world' });
    t.is(afterRevert.length, 2, 'should remove assistant message after revert');
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
      'gpt-4o'
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
