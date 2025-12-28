import { randomUUID } from 'node:crypto';

import type { ExecutionContext, TestFn } from 'ava';
import ava from 'ava';
import { z } from 'zod';

import { ServerFeature, ServerService } from '../core';
import { AuthService } from '../core/auth';
import { QuotaModule } from '../core/quota';
import { Models } from '../models';
import { CopilotModule } from '../plugins/copilot';
import { prompts, PromptService } from '../plugins/copilot/prompt';
import {
  CopilotProviderFactory,
  CopilotProviderType,
  StreamObject,
  StreamObjectSchema,
} from '../plugins/copilot/providers';
import { TranscriptionResponseSchema } from '../plugins/copilot/transcript/types';
import {
  CopilotChatTextExecutor,
  CopilotWorkflowService,
  GraphExecutorState,
} from '../plugins/copilot/workflow';
import {
  CopilotChatImageExecutor,
  CopilotCheckHtmlExecutor,
  CopilotCheckJsonExecutor,
} from '../plugins/copilot/workflow/executor';
import { createTestingModule, TestingModule } from './utils';
import { TestAssets } from './utils/copilot';

type Tester = {
  auth: AuthService;
  module: TestingModule;
  models: Models;
  service: ServerService;
  prompt: PromptService;
  factory: CopilotProviderFactory;
  workflow: CopilotWorkflowService;
  executors: {
    image: CopilotChatImageExecutor;
    text: CopilotChatTextExecutor;
    html: CopilotCheckHtmlExecutor;
    json: CopilotCheckJsonExecutor;
  };
};
const test = ava as TestFn<Tester>;

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
  const module = await createTestingModule({
    imports: [QuotaModule, CopilotModule],
  });

  const service = module.get(ServerService);
  isCopilotConfigured = service.features.includes(ServerFeature.Copilot);

  const auth = module.get(AuthService);
  const models = module.get(Models);
  const prompt = module.get(PromptService);
  const factory = module.get(CopilotProviderFactory);
  const workflow = module.get(CopilotWorkflowService);

  t.context.module = module;
  t.context.auth = auth;
  t.context.service = service;
  t.context.models = models;
  t.context.prompt = prompt;
  t.context.factory = factory;
  t.context.workflow = workflow;
  t.context.executors = {
    image: module.get(CopilotChatImageExecutor),
    text: module.get(CopilotChatTextExecutor),
    html: module.get(CopilotCheckHtmlExecutor),
    json: module.get(CopilotCheckJsonExecutor),
  };
});

test.serial.before(async t => {
  const { prompt, executors, models, service } = t.context;

  executors.image.register();
  executors.text.register();
  executors.html.register();
  executors.json.register();

  for (const name of await prompt.listNames()) {
    await prompt.delete(name);
  }

  for (const p of prompts) {
    await prompt.set(p.name, p.model, p.messages, p.config);
  }

  const user = await models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  await service.updateConfig(user.id, [
    {
      module: 'copilot',
      key: 'scenarios',
      value: {
        enabled: true,
        scenarios: {
          image: 'flux-1/schnell',
          rerank: 'gpt-5-mini',
          complex_text_generation: 'gpt-5-mini',
          coding: 'gpt-5-mini',
          quick_decision_making: 'gpt-5-mini',
          quick_text_generation: 'gpt-5-mini',
          polish_and_summarize: 'gemini-2.5-flash',
        },
      },
    },
  ]);
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
    messages: [
      {
        role: 'user' as const,
        content: `
Hi! I’m going to send you a technical term related to real-time collaborative editing (e.g., CRDT, Operational Transformation, OT Composer, etc.). Whenever I send you a term:
1. Translate it into Chinese (send me the Chinese version).
2. Then translate that Chinese back into English (send me the retranslated English).
3. Provide a brief, English-language introduction and context for this concept.
4. In that English explanation, annotate any niche terms with their Chinese equivalents in parentheses (for example: “Conflict-Free Replicated Data Type (无冲突复制数据类型)”).
5. Finally, give the origin or “term history” (e.g., who introduced it, in which paper or year).

If you understand, please proceed by explaining the term “CRDT.”
      `.trim(),
      },
      {
        role: 'assistant' as const,
        content: `
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
      `.trim(),
      },
      {
        role: 'user' as const,
        content: `Thanks! Now please just tell me the **Chinese translation** and the **back-translated English term** that you provided previously for “CRDT.” Do not reprint the full introduction—only those two lines.`,
      },
    ],
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
    messages: [
      {
        role: 'user' as const,
        content: 'what is AFFiNE AI?',
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
      },
    ],
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
    messages: [
      {
        role: 'user' as const,
        content: 'what is ssot',
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
      },
    ],
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      assertCitation(t, result);
    },
    type: 'text' as const,
  },
  {
    name: 'stream objects',
    promptName: ['Chat With AFFiNE AI'],
    messages: [
      {
        role: 'user' as const,
        content: 'what is AFFiNE AI',
      },
    ],
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      t.truthy(checkStreamObjects(result), 'should be valid stream objects');
    },
    type: 'object' as const,
  },
  {
    name: 'Should transcribe short audio',
    promptName: ['Transcript audio'],
    messages: [
      {
        role: 'user' as const,
        content: 'transcript the audio',
        attachments: [
          'https://cdn.affine.pro/copilot-test/MP9qDGuYgnY+ILoEAmHpp3h9Npuw2403EAYMEA.mp3',
        ],
        params: {
          schema: TranscriptionResponseSchema,
        },
      },
    ],
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      t.notThrows(() => {
        TranscriptionResponseSchema.parse(JSON.parse(result));
      });
    },
    type: 'structured' as const,
    prefer: CopilotProviderType.Gemini,
  },
  {
    name: 'Should transcribe middle audio',
    promptName: ['Transcript audio'],
    messages: [
      {
        role: 'user' as const,
        content: 'transcript the audio',
        attachments: [
          'https://cdn.affine.pro/copilot-test/2ed05eo1KvZ2tWB_BAjFo67EAPZZY-w4LylUAw.m4a',
        ],
        params: {
          schema: TranscriptionResponseSchema,
        },
      },
    ],
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      t.notThrows(() => {
        TranscriptionResponseSchema.parse(JSON.parse(result));
      });
    },
    type: 'structured' as const,
    prefer: CopilotProviderType.Gemini,
  },
  {
    name: 'Should transcribe long audio',
    promptName: ['Transcript audio'],
    messages: [
      {
        role: 'user' as const,
        content: 'transcript the audio',
        attachments: [
          'https://cdn.affine.pro/copilot-test/nC9-e7P85PPI2rU29QWwf8slBNRMy92teLIIMw.opus',
        ],
        params: {
          schema: TranscriptionResponseSchema,
        },
      },
    ],
    config: { model: 'gemini-2.5-pro' },
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      t.notThrows(() => {
        TranscriptionResponseSchema.parse(JSON.parse(result));
      });
    },
    type: 'structured' as const,
    prefer: CopilotProviderType.Gemini,
  },
  {
    promptName: ['Conversation Summary'],
    messages: [
      {
        role: 'user' as const,
        content: '',
        params: {
          messages: [
            { role: 'user', content: 'what is single source of truth?' },
            { role: 'assistant', content: TestAssets.SSOT },
          ],
          focus: 'technical decisions',
          length: 'comprehensive',
        },
      },
    ],
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
    messages: [{ role: 'user' as const, content: TestAssets.SSOT }],
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
    messages: [{ role: 'user' as const, content: TestAssets.AFFiNE }],
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      t.assert(result.length > 0, 'should not be empty');
    },
    type: 'text' as const,
  },
  {
    promptName: ['Brainstorm ideas about this', 'Brainstorm mindmap'],
    messages: [{ role: 'user' as const, content: TestAssets.AFFiNE }],
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      t.assert(checkMDList(result), 'should be a markdown list');
    },
    type: 'text' as const,
  },
  {
    promptName: 'Expand mind map',
    messages: [{ role: 'user' as const, content: '- Single source of truth' }],
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      t.assert(checkMDList(result), 'should be a markdown list');
    },
    type: 'text' as const,
  },
  {
    promptName: 'Find action items from it',
    messages: [{ role: 'user' as const, content: TestAssets.TODO }],
    verifier: (t: ExecutionContext<Tester>, result: string) => {
      assertNotWrappedInCodeBlock(t, result);
      t.assert(checkMDList(result), 'should be a markdown list');
    },
    type: 'text' as const,
  },
  {
    promptName: ['Explain this code', 'Check code error'],
    messages: [{ role: 'user' as const, content: TestAssets.Code }],
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
    messages: [
      {
        role: 'user' as const,
        content: TestAssets.SSOT,
        params: { language: 'Simplified Chinese' },
      },
    ],
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
    messages: [
      {
        role: 'user' as const,
        content: '',
        attachments: [
          'https://cdn.affine.pro/copilot-test/Qgqy9qZT3VGIEuMIotJYoCCH.jpg',
        ],
      },
    ],
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
    messages: [
      {
        role: 'user' as const,
        content: '',
        attachments: [
          'https://cdn.affine.pro/copilot-test/Zkas098lkjdf-908231.jpg',
        ],
      },
    ],
    verifier: (t: ExecutionContext<Tester>, link: string) => {
      t.truthy(checkUrl(link), 'should be a valid url');
    },
    type: 'image' as const,
  },
  {
    promptName: ['Generate image'],
    messages: [
      {
        role: 'user' as const,
        content: 'Panda',
      },
    ],
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
        const provider = (await factory.getProviderByModel(prompt.model, {
          prefer,
        }))!;
        t.truthy(provider, 'should have provider');
        await retry(`action: ${promptName}`, t, async t => {
          const finalConfig = Object.assign({}, prompt.config, config);
          const modelId = finalConfig.model || prompt.model;

          switch (type) {
            case 'text': {
              const result = await provider.text(
                { modelId },
                [
                  ...prompt.finish(
                    messages.reduce(
                      // @ts-expect-error params not typed
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
            case 'structured': {
              const result = await provider.structure(
                { modelId },
                [
                  ...prompt.finish(
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
              for await (const chunk of provider.streamObject(
                { modelId },
                [
                  ...prompt.finish(
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
              const stream = provider.streamImages(
                { modelId },
                [
                  ...prompt.finish(
                    finalMessage.reduce(
                      // @ts-expect-error params not typed
                      (acc, m) => Object.assign(acc, m.params),
                      params
                    )
                  ),
                  ...finalMessage,
                ],
                finalConfig
              );

              const result = [];
              for await (const attachment of stream) {
                result.push(attachment);
              }

              t.truthy(result.length, 'should return result');
              for (const r of result) {
                verifier?.(t, r);
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

// ==================== workflow ====================

const workflows = [
  {
    name: 'brainstorm',
    content: 'apple company',
    verifier: (t: ExecutionContext, result: string) => {
      t.assert(checkMDList(result), 'should be a markdown list');
    },
  },
  {
    name: 'presentation',
    content: 'apple company',
    verifier: (t: ExecutionContext, result: string) => {
      for (const l of result.split('\n')) {
        const line = l.trim();
        if (!line) continue;
        t.notThrows(() => {
          JSON.parse(l.trim());
        }, 'should be valid json');
      }
    },
  },
];

for (const { name, content, verifier } of workflows) {
  test(
    `should be able to run workflow: ${name}`,
    runIfCopilotConfigured,
    async t => {
      const { workflow } = t.context;

      await retry(`workflow: ${name}`, t, async t => {
        let result = '';
        for await (const ret of workflow.runGraph({ content }, name)) {
          if (ret.status === GraphExecutorState.EnterNode) {
            t.log('enter node:', ret.node.name);
          } else if (ret.status === GraphExecutorState.ExitNode) {
            t.log('exit node:', ret.node.name);
          } else if (ret.status === GraphExecutorState.EmitAttachment) {
            t.log('stream attachment:', ret);
          } else {
            result += ret.content;
          }
        }
        t.truthy(result, 'should return result');
        verifier?.(t, result);
      });
    }
  );
}

// ==================== rerank ====================

test(
  'should be able to rerank message chunks',
  runIfCopilotConfigured,
  async t => {
    const { factory, prompt } = t.context;

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

      const p = (await prompt.get('Rerank results'))!;
      t.assert(p, 'should have prompt for rerank');
      const provider = (await factory.getProviderByModel(p.model))!;
      t.assert(provider, 'should have provider for rerank');

      const scores = await provider.rerank(
        { modelId: p.model },
        embeddings.map(e => p.finish({ query, doc: e }))
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
