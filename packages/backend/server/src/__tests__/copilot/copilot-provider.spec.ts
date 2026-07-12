import { randomUUID } from 'node:crypto';

import { Global, Module } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ExecutionContext, TestFn } from 'ava';
import ava from 'ava';
import Sinon from 'sinon';
import { z } from 'zod';

import { AppModuleBuilder, FunctionalityModules } from '../../app.module';
import { JobModule, JobQueue } from '../../base';
import { ServerFeature, ServerService } from '../../core';
import { AuthModule, AuthService } from '../../core/auth';
import { QuotaModule } from '../../core/quota';
import { Models } from '../../models';
import { llmImageDispatchPlan } from '../../native';
import { CopilotModule } from '../../plugins/copilot';
import { PromptService } from '../../plugins/copilot/prompt';
import {
  CopilotProviderFactory,
  CopilotProviderType,
  StreamObject,
  StreamObjectSchema,
} from '../../plugins/copilot/providers';
import { ActionStreamHost } from '../../plugins/copilot/runtime/hosts/action-stream-host';
import { getProviderRuntimeHost } from '../../plugins/copilot/runtime/provider-runtime-context';
import { ChatSession, ChatSessionService } from '../../plugins/copilot/session';
import { TranscriptPayloadSchema } from '../../plugins/copilot/transcript/schema';
import { CopilotTranscriptionService } from '../../plugins/copilot/transcript/service';
import { TestingPromptService } from '../mocks/prompt-service.mock';
import { MockJobQueue } from '../mocks/queue.mock';
import { createTestingModule, TestingModule } from '../utils';
import { TestAssets } from '../utils/copilot';
import {
  assistantPrompt,
  promptMessages,
  singleUserPromptMessages,
  userPrompt,
} from './prompt-test-helper';

type Tester = {
  auth: AuthService;
  module: TestingModule;
  models: Models;
  service: ServerService;
  prompt: TestingPromptService;
  factory: CopilotProviderFactory;
  session: ChatSessionService;
  actionStreams: ActionStreamHost;
  transcript: CopilotTranscriptionService;
};

const test = ava as TestFn<Tester>;

@Global()
@Module({
  providers: [{ provide: JobQueue, useClass: MockJobQueue }],
  exports: [JobQueue],
})
class MockJobModule {}

let isCopilotConfigured = false;
const runIfCopilotConfigured = test.macro(
  async (
    t,
    callback: (t: ExecutionContext<Tester>) => Promise<void> | void
  ) => {
    if (isCopilotConfigured) {
      await callback(t);
    } else {
      t.log('Skip test because copilot is not configured');
      t.pass();
    }
  }
);

test.serial.before(async t => {
  const appModule = new AppModuleBuilder()
    .use(
      ...FunctionalityModules.filter(module => {
        const moduleType = 'module' in module ? module.module : module;
        return moduleType !== JobModule;
      }),
      MockJobModule,
      AuthModule,
      QuotaModule,
      CopilotModule
    )
    .compile();
  const module = await createTestingModule({
    imports: [appModule],
    tapModule: builder => {
      builder.overrideProvider(PromptService).useClass(TestingPromptService);
    },
  });

  const service = module.get(ServerService);
  isCopilotConfigured = service.features.includes(ServerFeature.Copilot);

  const auth = module.get(AuthService);
  const models = module.get(Models);
  const prompt = module.get(PromptService) as TestingPromptService;
  const factory = module.get(CopilotProviderFactory);
  const session = module.get(ChatSessionService);
  const actionStreams = module.get(ActionStreamHost);
  const transcript = module.get(CopilotTranscriptionService);

  t.context.module = module;
  t.context.auth = auth;
  t.context.service = service;
  t.context.models = models;
  t.context.prompt = prompt;
  t.context.factory = factory;
  t.context.session = session;
  t.context.actionStreams = actionStreams;
  t.context.transcript = transcript;
});

test.serial.before(async t => {
  const { prompt } = t.context;

  prompt.reset();
});

test.after(async t => {
  await t.context.module.close();
});

const assertNotWrappedInCodeBlock = (
  t: ExecutionContext<Tester>,
  result: string
) => {
  t.assert(
    !result.replaceAll('\n', '').trim().startsWith('```') &&
      !result.replaceAll('\n', '').trim().endsWith('```'),
    'should not wrap in code block'
  );
};

const citationChecker = (
  t: ExecutionContext<Tester>,
  citations: { citationNumber: string; citationJson: string }[]
) => {
  t.assert(citations.length > 0, 'should have citation');
  for (const { citationJson } of citations) {
    t.notThrows(() => {
      JSON.parse(citationJson);
    }, `should be valid json: ${citationJson}`);
  }
};

type CitationChecker = typeof citationChecker;

const assertCitation = (
  t: ExecutionContext<Tester>,
  result: string,
  citationCondition: CitationChecker = citationChecker
) => {
  const regex = /\[\^(\d+)\]:\s*({.*})/g;
  const citations = [];
  let match;
  while ((match = regex.exec(result)) !== null) {
    const citationNumber = match[1];
    const citationJson = match[2];
    citations.push({ citationNumber, citationJson });
  }
  citationCondition(t, citations);
};

const checkMDList = (text: string) => {
  const lines = text.split('\n');
  const listItemRegex = /^( {2})*(-|\u2010-\u2015|\*|\+)? .+$/;
  let prevIndent = null;

  for (const line of lines) {
    if (line.trim() === '') continue;
    if (!listItemRegex.test(line)) {
      return false;
    }

    const currentIndent = line.match(/^( *)/)?.[0].length!;
    if (Number.isNaN(currentIndent) || currentIndent % 2 !== 0) {
      return false;
    }

    if (prevIndent !== null && currentIndent > 0) {
      const indentDiff = currentIndent - prevIndent;
      // allow 1 level of indentation difference
      if (indentDiff > 2) {
        return false;
      }
    }

    if (line.trim().startsWith('-')) {
      prevIndent = currentIndent;
    }
  }

  return true;
};

const checkUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const checkStreamObjects = (result: string) => {
  try {
    const streamObjects = JSON.parse(result);
    z.array(StreamObjectSchema).parse(streamObjects);
    return true;
  } catch {
    return false;
  }
};

const parseStreamObjects = (result: string): StreamObject[] => {
  const streamObjects = JSON.parse(result);
  return z.array(StreamObjectSchema).parse(streamObjects);
};

const getStreamObjectText = (result: string) =>
  parseStreamObjects(result)
    .filter(
      (chunk): chunk is Extract<StreamObject, { type: 'text-delta' }> =>
        chunk.type === 'text-delta'
    )
    .map(chunk => chunk.textDelta)
    .join('');

const retry = async (
  action: string,
  t: ExecutionContext<Tester>,
  callback: (t: ExecutionContext<Tester>) => Promise<void>
) => {
  let i = 3;
  while (i--) {
    const ret = await t.try(async t => {
      try {
        await callback(t);
      } catch (e) {
        console.error(`Error during ${action}:`, e);
        t.log(`Error during ${action}:`, e);
        throw e;
      }
    });
    if (ret.passed) {
      return ret.commit();
    } else {
      ret.discard({ retainLogs: true });
      t.log(ret.errors.map(e => e.message || e.name || String(e)).join('\n'));
      t.log(`retrying ${action} ${3 - i}/3 ...`);
    }
  }
  t.fail(`failed to run ${action}`);
};

// ==================== utils ====================

test('should validate markdown list', t => {
  t.true(
    checkMDList(`
- item 1
- item 2
`)
  );
  t.true(
    checkMDList(`
- item 1
  - item 1.1
- item 2
`)
  );
  t.true(
    checkMDList(`
- item 1
  - item 1.1
    - item 1.1.1
- item 2
`)
  );
  t.true(
    checkMDList(`
- item 1
  - item 1.1
    - item 1.1.1
    - item 1.1.2
- item 2
`)
  );
  t.true(
    checkMDList(`
- item 1
  - item 1.1
    - item 1.1.1
- item 1.2
`)
  );
  t.false(
    checkMDList(`
- item 1
  - item 1.1
      - item 1.1.1.1
`)
  );
  t.true(
    checkMDList(`
- item 1
  - item 1.1
    - item 1.1.1.1
      item 1.1.1.1 line breaks
    - item 1.1.1.2
`),
    'should allow line breaks'
  );
});

// ==================== action ====================

const actions = [
  {
    name: 'Should chat with histories',
    promptName: ['Chat With AFFiNE AI'],
    messages: promptMessages(
      userPrompt(
        `
Hi! I’m going to send you a technical term related to real-time collaborative editing (e.g., CRDT, Operational Transformation, OT Composer, etc.). Whenever I send you a term:
1. Translate it into Chinese (send me the Chinese version).
2. Then translate that Chinese back into English (send me the retranslated English).
3. Provide a brief, English-language introduction and context for this concept.
4. In that English explanation, annotate any niche terms with their Chinese equivalents in parentheses (for example: “Conflict-Free Replicated Data Type (无冲突复制数据类型)”).
5. Finally, give the origin or “term history” (e.g., who introduced it, in which paper or year).

If you understand, please proceed by explaining the term “CRDT.”
      `.trim()
      ),
      assistantPrompt(
        `
1. **Chinese Translation:**  
“CRDT” → **无冲突复制数据类型**

2. **Back-Translation to English:**  
无冲突复制数据类型 → **Conflict-Free Replicated Data Type**

3. **English Introduction & Context:**  
A **Conflict-Free Replicated Data Type (无冲突复制数据类型)** is an abstract data type designed for distributed systems where replicas of shared state may be modified concurrently without requiring coordination. CRDTs allow multiple users or processes to update the same data structure (for example, a shared document in a collaborative editor) at the same time.  
- **Key Terms (with Chinese equivalents):**  
  - **Replica (副本):** Each node or client maintains its own copy of the data.  
  - **State-based (状态型) vs. Operation-based (操作型):** Two main CRDT classes; state-based CRDTs exchange entire state snapshots occasionally, whereas operation-based CRDTs broadcast only incremental operations.  
  - **Merge Function (合并函数):** A deterministic function that resolves differences between two replicas without conflicts.  

CRDTs enable **eventual consistency (最终一致性)** in real-time collaborative editors by ensuring that, after all updates propagate, every replica converges to the same state, even if operations arrive in different orders. This approach removes the need for a centralized server to resolve conflicts, making offline or peer-to-peer editing possible.

4. **Origin / Term History:**  
The term **“CRDT”** was first introduced by Marc Shapiro, Nuno Preguiça, Carlos Baquero, and Marek Zawirski in their 2011 paper titled “Conflict-free Replicated Data Types” (published in the _Stabilization, Safety, and Security of Distributed Systems (SSS)_ conference). They formalized two families of CRDTs—state-based (“Convergent Replicated Data Types” or CvRDTs) and operation-based (“Commutative Replicated Data Types” or CmRDTs)—and proved their convergence properties under asynchronous, unreliable networks.
      `.trim()
      ),
      userPrompt(
        'Thanks! Now please just tell me the **Chinese translation** and the **back-translated English term** that you provided previously for “CRDT.” Do not reprint the full introduction—only those two lines.'
      )
    ),
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      const lower = result.toLowerCase();
      t.assert(
        lower.includes('无冲突复制数据类型') &&
          lower.includes('conflict-free replicated data type'),
        'The response should include “无冲突复制数据类型” and “Conflict-Free Replicated Data Type”'
      );
    },
    type: 'text' as const,
  },
  {
    name: 'Should not have citation',
    promptName: ['Chat With AFFiNE AI'],
    messages: singleUserPromptMessages('what is AFFiNE AI?', {
      params: {
        files: [
          {
            blobId: 'todo_md',
            fileName: 'todo.md',
            fileType: 'text/markdown',
            fileContent: TestAssets.TODO,
          },
        ],
      },
    }),
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      assertCitation(t, result, (t, c) => {
        t.assert(
          c.length === 0 ||
            // ignore web search result
            c
              .map(c => JSON.parse(c.citationJson).type)
              .filter(type => ['attachment', 'doc'].includes(type)).length ===
              0,
          `should not have citation: ${JSON.stringify(c, null, 2)}`
        );
      });
    },
    type: 'text' as const,
  },
  {
    name: 'Should have citation',
    promptName: ['Chat With AFFiNE AI'],
    messages: singleUserPromptMessages('what is ssot', {
      params: {
        docs: [
          {
            docId: 'SSOT',
            docTitle: 'Single source of truth - Wikipedia',
            fileType: 'text/markdown',
            docContent: TestAssets.SSOT,
          },
        ],
      },
    }),
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      assertCitation(t, result);
    },
    type: 'text' as const,
  },
  {
    name: 'stream objects',
    promptName: ['Chat With AFFiNE AI'],
    messages: singleUserPromptMessages('what is AFFiNE AI'),
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      t.truthy(checkStreamObjects(result), 'should be valid stream objects');
    },
    type: 'object' as const,
  },
  {
    name: 'Gemini native text',
    promptName: ['Chat With AFFiNE AI'],
    messages: singleUserPromptMessages(
      'In one short sentence, explain what AFFiNE AI is and mention AFFiNE by name.'
    ),
    config: { model: 'gemini-2.5-flash' },
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      t.assert(
        result.toLowerCase().includes('affine'),
        'should mention AFFiNE'
      );
    },
    prefer: CopilotProviderType.Gemini,
    type: 'text' as const,
  },
  {
    name: 'Gemini native stream objects',
    promptName: ['Chat With AFFiNE AI'],
    messages: singleUserPromptMessages(
      'Respond with one short sentence about AFFiNE AI and mention AFFiNE by name.'
    ),
    config: { model: 'gemini-2.5-flash' },
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      t.truthy(checkStreamObjects(result), 'should be valid stream objects');
      const assembledText = getStreamObjectText(result);
      t.assert(
        assembledText.toLowerCase().includes('affine'),
        'should mention AFFiNE'
      );
    },
    prefer: CopilotProviderType.Gemini,
    type: 'object' as const,
  },
  {
    promptName: ['Conversation Summary'],
    messages: singleUserPromptMessages('', {
      params: {
        messages: [
          userPrompt('what is single source of truth?'),
          assistantPrompt(TestAssets.SSOT),
        ],
        focus: 'technical decisions',
        length: 'comprehensive',
      },
    }),
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      const cleared = result.toLowerCase();
      t.assert(
        cleared.includes('single source of truth') ||
          /single.*source/.test(cleared) ||
          cleared.includes('ssot'),
        'should include original keyword'
      );
    },
    type: 'text' as const,
  },
  {
    promptName: [
      'Summary',
      'Summary as title',
      'Explain this',
      'Write an article about this',
      'Write a twitter about this',
      'Write a poem about this',
      'Write a blog post about this',
      'Write outline',
      'Change tone to',
      'Improve writing for it',
      'Improve grammar for it',
      'Fix spelling for it',
      'Create headings',
      'Make it longer',
      'Make it shorter',
      'Section Edit',
      'Chat With AFFiNE AI',
    ],
    messages: singleUserPromptMessages(TestAssets.SSOT),
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      const cleared = result.toLowerCase();
      t.assert(
        cleared.includes('single source of truth') ||
          /single.*source/.test(cleared) ||
          cleared.includes('ssot'),
        'should include original keyword'
      );
    },
    type: 'text' as const,
  },
  {
    promptName: ['Continue writing'],
    messages: singleUserPromptMessages(TestAssets.AFFiNE),
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      t.assert(result.length > 0, 'should not be empty');
    },
    type: 'text' as const,
  },
  {
    promptName: ['Brainstorm ideas about this', 'Brainstorm mindmap'],
    messages: singleUserPromptMessages(TestAssets.AFFiNE),
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      t.assert(checkMDList(result), 'should be a markdown list');
    },
    type: 'text' as const,
  },
  {
    promptName: 'Expand mind map',
    messages: singleUserPromptMessages('- Single source of truth'),
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      t.assert(checkMDList(result), 'should be a markdown list');
    },
    type: 'text' as const,
  },
  {
    promptName: 'Find action items from it',
    messages: singleUserPromptMessages(TestAssets.TODO),
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      t.assert(checkMDList(result), 'should be a markdown list');
    },
    type: 'text' as const,
  },
  {
    promptName: ['Explain this code', 'Check code error'],
    messages: singleUserPromptMessages(TestAssets.Code),
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      t.assert(
        result.toLowerCase().includes('distance') ||
          /no.*error/.test(result.toLowerCase()),
        'explain code result should include keyword'
      );
    },
    type: 'text' as const,
  },
  {
    promptName: 'Translate to',
    messages: singleUserPromptMessages(TestAssets.SSOT, {
      params: { language: 'Simplified Chinese' },
    }),
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      const cleared = result.toLowerCase();
      t.assert(
        cleared.includes('单一') || cleared.includes('SSOT'),
        'explain code result should include keyword'
      );
    },
    type: 'text' as const,
  },
  {
    promptName: ['Generate a caption', 'Explain this image'],
    messages: singleUserPromptMessages('', {
      attachments: [
        'https://cdn.affine.pro/copilot-test/Qgqy9qZT3VGIEuMIotJYoCCH.jpg',
      ],
    }),
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      const content = result.toLowerCase();
      t.assert(
        content.includes('classroom') ||
          content.includes('school') ||
          content.includes('sky'),
        'explain code result should include keyword'
      );
    },
    type: 'text' as const,
  },
  {
    promptName: ['Convert to sticker', 'Remove background', 'Upscale image'],
    messages: singleUserPromptMessages('', {
      attachments: [
        'https://cdn.affine.pro/copilot-test/Zkas098lkjdf-908231.jpg',
      ],
    }),
    verifier: (t: ExecutionContext<Tester>, link: string) => {
      t.truthy(checkUrl(link), 'should be a valid url');
    },
    type: 'image' as const,
  },
  {
    promptName: ['Generate image'],
    messages: singleUserPromptMessages('Panda'),
    config: { quality: 'low' },
    verifier: (t: ExecutionContext<Tester>, link: string) => {
      t.truthy(checkUrl(link), 'should be a valid url');
    },
    type: 'image' as const,
  },
];

for (const {
  name,
  promptName,
  messages,
  verifier,
  type,
  config,
  prefer,
} of actions) {
  const prompts = Array.isArray(promptName) ? promptName : [promptName];
  for (const promptName of prompts) {
    test(
      `should be able to run action: ${promptName}${name ? ` - ${name}` : ''}`,
      runIfCopilotConfigured,
      async t => {
        const { factory, prompt: promptService } = t.context;
        const prompt = (await promptService.get(promptName))!;
        t.truthy(prompt, 'should have prompt');
        const finalConfig = Object.assign({}, prompt.config, config);
        const modelId =
          ('model' in finalConfig ? finalConfig.model : undefined) ??
          prompt.model;
        const provider = (await factory.getProviderByModel(modelId, {
          prefer,
        }))!;
        t.truthy(provider, 'should have provider');
        await retry(`action: ${promptName}`, t, async t => {
          switch (type) {
            case 'text': {
              const result = await getProviderRuntimeHost(provider).run.text(
                { modelId },
                [
                  ...promptService.finish(
                    prompt,
                    messages.reduce(
                      (acc, m) => Object.assign(acc, m.params),
                      {}
                    )
                  ),
                  ...messages,
                ],
                finalConfig
              );
              t.truthy(result, 'should return result');
              verifier?.(t, result);
              break;
            }
            case 'object': {
              const streamObjects: StreamObject[] = [];
              for await (const chunk of getProviderRuntimeHost(
                provider
              ).run.streamObject(
                { modelId },
                [
                  ...promptService.finish(
                    prompt,
                    messages.reduce(
                      (acc, m) => Object.assign(acc, (m as any).params || {}),
                      {}
                    )
                  ),
                  ...messages,
                ],
                finalConfig
              )) {
                streamObjects.push(chunk);
              }
              t.truthy(streamObjects, 'should return result');
              verifier?.(t, JSON.stringify(streamObjects));
              break;
            }
            case 'image': {
              const finalMessage = [...messages];
              const params = {};
              if (finalMessage.length === 1) {
                const latestMessage = finalMessage.pop()!;
                Object.assign(params, {
                  content: latestMessage.content,
                  attachments:
                    'attachments' in latestMessage
                      ? latestMessage.attachments
                      : undefined,
                });
              }
              const imageMessages = [
                ...promptService.finish(
                  prompt,
                  finalMessage.reduce(
                    (acc, m) => Object.assign(acc, m.params),
                    params
                  )
                ),
                ...finalMessage,
              ];
              const prepared = await getProviderRuntimeHost(
                provider
              ).prepare.image({ modelId }, imageMessages, finalConfig);
              t.truthy(prepared, 'should prepare image request');
              const result = await llmImageDispatchPlan({
                preparedRoutes: [
                  {
                    provider_id: prepared!.route.providerId,
                    protocol: prepared!.route.protocol,
                    model: prepared!.route.model,
                    config: prepared!.route.backendConfig,
                    request: prepared!.request,
                  },
                ],
              });

              t.truthy(result.response.images.length, 'should return result');
              for (const image of result.response.images) {
                const link = image.data_base64
                  ? `data:${image.media_type};base64,${image.data_base64}`
                  : image.url;
                t.truthy(link);
                verifier?.(t, link!);
              }
              break;
            }
            default: {
              t.fail('unsupported provider type');
              break;
            }
          }
        });
      }
    );
  }
}

// ==================== action recipes ====================

function actionRunRecord(
  input: Parameters<Models['copilotActionRun']['create']>[0]
) {
  return {
    id: `action-run-${randomUUID()}`,
    userId: input.userId,
    workspaceId: input.workspaceId,
    docId: input.docId ?? null,
    sessionId: input.sessionId ?? null,
    userMessageId: input.userMessageId ?? null,
    compatSubmissionId: input.compatSubmissionId ?? null,
    assistantMessageId: null,
    actionId: input.actionId,
    actionVersion: input.actionVersion,
    status: 'created' as const,
    attempt: input.attempt ?? 1,
    retryOf: input.retryOf ?? null,
    inputSnapshot: (input.inputSnapshot ?? null) as Prisma.JsonValue,
    result: null,
    artifacts: null,
    resultSummary: null,
    errorCode: null,
    trace: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function installActionSessionMock(
  t: ExecutionContext<Tester>,
  {
    actionId,
    actionPrompt,
    content,
  }: {
    actionId: string;
    actionPrompt: Awaited<ReturnType<TestingPromptService['get']>>;
    content: string;
  }
) {
  const { models, session } = t.context;
  const sandbox = Sinon.createSandbox();
  const sessionId = `copilot-provider-action-${actionId}-${randomUUID()}`;
  const user = await models.user.create({
    email: `copilot-provider-user-${randomUUID()}@affine.test`,
  });
  const userId = user.id;
  const workspace = await models.workspace.create(userId);
  const workspaceId = workspace.id;
  const docId = `copilot-provider-action-${actionId}-doc`;
  const savedTurns: Array<{ role: string }> = [];
  const userTurn = {
    conversationId: sessionId,
    role: 'user' as const,
    content,
    attachments: [],
    renderTrace: [],
    toolEvents: [],
    metadata: { language: 'English' },
    createdAt: new Date(),
  };
  const chatSession = new ChatSession(
    {
      userId,
      sessionId,
      workspaceId,
      docId,
      turns: [userTurn],
      prompt: actionPrompt!,
    },
    (prompt, turns, params, maxTokenSize, sessionId) =>
      t.context.prompt.renderSession(
        prompt,
        turns,
        params,
        maxTokenSize,
        sessionId
      ),
    async state => {
      savedTurns.push(...state.turns);
    }
  );

  sandbox
    .stub(session, 'get')
    .callsFake(async id => (id === sessionId ? chatSession : null));
  sandbox.stub(session, 'appendTurn').callsFake(async input => {
    savedTurns.push(input.turn);
    return { ...input.turn, id: `assistant-${randomUUID()}` };
  });
  sandbox.stub(session, 'revertLatestMessage').resolves();
  sandbox
    .stub(models.copilotActionRun, 'create')
    .callsFake(async input => actionRunRecord(input));
  sandbox.stub(models.copilotActionRun, 'markRunning').callsFake(
    async id =>
      ({
        id,
        status: 'running',
      }) as never
  );
  sandbox.stub(models.copilotActionRun, 'complete').callsFake(
    async (id, input) =>
      ({
        id,
        ...input,
        updatedAt: new Date(),
      }) as never
  );

  return { sandbox, sessionId, userId, savedTurns };
}

const actionRecipeCases = [
  {
    actionId: 'mindmap.generate',
    content: 'apple company',
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      t.assert(checkMDList(result), 'should be a markdown list');
    },
  },
  {
    actionId: 'slides.outline',
    content: 'apple company',
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      t.assert(
        result
          .split('\n')
          .filter(line => line.trim())
          .every(line => /^( {2})*(-|\*|\+) .+$/.test(line)),
        'should be a markdown list'
      );
      t.false(
        result
          .split('\n')
          .filter(line => line.trim())
          .every(line => {
            try {
              JSON.parse(line);
              return true;
            } catch {
              return false;
            }
          }),
        'should not expose raw NDJSON'
      );
    },
  },
];

for (const { actionId, content, verifier } of actionRecipeCases) {
  test.serial(
    `should be able to run action recipe: ${actionId}`,
    runIfCopilotConfigured,
    async t => {
      await retry(`action recipe: ${actionId}`, t, async t => {
        const { actionStreams, prompt } = t.context;
        const actionPrompt = await prompt.get(actionId);
        if (!actionPrompt) {
          return t.fail(`prompt ${actionId} should exist`);
        }

        const { sandbox, sessionId, userId, savedTurns } =
          await installActionSessionMock(t, {
            actionId,
            actionPrompt,
            content,
          });

        let result = '';
        try {
          const prepared = await actionStreams.stream(userId, sessionId, {
            actionId,
            actionVersion: 'v1',
            modelId: actionPrompt.model,
          });

          for await (const event of prepared.stream) {
            if (event.type === 'action_done' && event.status === 'succeeded') {
              if (typeof event.result === 'string') {
                result += event.result;
              } else if (event.result && typeof event.result === 'object') {
                const value = event.result as {
                  content?: unknown;
                  text?: unknown;
                  result?: unknown;
                };
                result +=
                  typeof value.content === 'string'
                    ? value.content
                    : typeof value.text === 'string'
                      ? value.text
                      : typeof value.result === 'string'
                        ? value.result
                        : '';
              }
            }
          }
        } finally {
          sandbox.restore();
        }
        t.truthy(result, 'should return result');
        verifier(t, result);
        t.true(
          savedTurns.some(turn => turn.role === 'assistant'),
          'should persist assistant turn through real conversation host'
        );
      });
    }
  );
}

const TRANSCRIPT_AUDIO_CASES = [
  {
    name: 'short audio',
    url: 'https://cdn.affine.pro/copilot-test/MP9qDGuYgnY+ILoEAmHpp3h9Npuw2403EAYMEA.mp3',
    mimeType: 'audio/mpeg',
    modelId: 'gemini-2.5-flash',
  },
  {
    name: 'middle audio',
    url: 'https://cdn.affine.pro/copilot-test/2ed05eo1KvZ2tWB_BAjFo67EAPZZY-w4LylUAw.m4a',
    mimeType: 'audio/m4a',
    modelId: 'gemini-2.5-flash',
  },
  {
    name: 'long audio',
    url: 'https://cdn.affine.pro/copilot-test/nC9-e7P85PPI2rU29QWwf8slBNRMy92teLIIMw.opus',
    mimeType: 'audio/opus',
    modelId: 'gemini-2.5-pro',
  },
];

for (const testCase of TRANSCRIPT_AUDIO_CASES) {
  test(
    `should run transcript task through native action bridge: ${testCase.name}`,
    runIfCopilotConfigured,
    async t => {
      const { models, transcript } = t.context;
      const user = await models.user.create({
        email: `copilot-provider-transcript-${randomUUID()}@affine.pro`,
      });
      const workspace = await models.workspace.create(user.id);
      const blobId = `copilot-provider-transcript-blob-${randomUUID()}`;
      const payload = TranscriptPayloadSchema.parse({
        sourceAudio: { blobId, mimeType: testCase.mimeType },
        infos: [
          {
            url: testCase.url,
            mimeType: testCase.mimeType,
            index: 0,
          },
        ],
      });
      const task = await models.copilotTranscriptTask.create({
        userId: user.id,
        workspaceId: workspace.id,
        blobId,
        strategy: 'gemini',
        recipeId: 'transcript.audio.gemini',
        recipeVersion: 'v1',
        inputSnapshot: payload,
        publicMeta: {
          sourceAudio: payload.sourceAudio,
          infos: payload.infos,
        },
      });

      await retry('transcript native action recipe', t, async t => {
        await transcript.transcriptTask({
          taskId: task.id,
          payload,
          modelId: testCase.modelId,
        });
        const ready = await models.copilotTranscriptTask.get(task.id);
        t.is(ready?.status, 'ready');
        const parsed = TranscriptPayloadSchema.parse(ready?.protectedResult);
        t.is(typeof parsed.normalizedTranscript, 'string');
      });
    }
  );
}

// ==================== rerank ====================

test(
  'should be able to rerank message chunks',
  runIfCopilotConfigured,
  async t => {
    const { factory } = t.context;

    await retry('rerank', t, async t => {
      const query = 'Is this content relevant to programming?';
      const embeddings = [
        'How to write JavaScript code for web development.',
        'Today is a beautiful sunny day for walking in the park.',
        'Python is a popular programming language for data science.',
        'The weather forecast predicts rain for the weekend.',
        'JavaScript frameworks like React and Angular are widely used.',
        'Cooking recipes can be found in many online blogs.',
        'Machine learning algorithms are essential for AI development.',
        'The latest smartphone models have impressive camera features.',
        'Learning to code can open up many career opportunities.',
        'The stock market is experiencing significant fluctuations.',
      ];

      const provider = (await factory.getProviderByModel('gpt-4o-mini'))!;
      t.assert(provider, 'should have provider for rerank');

      const scores = await getProviderRuntimeHost(provider).run.rerank(
        { modelId: 'gpt-4o-mini' },
        {
          query,
          candidates: embeddings.map((text, index) => ({
            id: String(index),
            text,
          })),
        }
      );

      t.is(scores.length, 10, 'should return scores for all chunks');

      for (const score of scores) {
        t.assert(
          typeof score === 'number' && score >= 0 && score <= 1,
          `score should be a number between 0 and 1, got ${score}`
        );
      }

      t.log('Rerank scores:', scores);
      t.is(
        scores.filter(s => s > 0.5).length,
        4,
        'should have 4 related chunks'
      );
    });
  }
);
