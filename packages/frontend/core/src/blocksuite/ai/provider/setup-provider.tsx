import { toggleGeneralAIOnboarding } from '@affine/core/components/affine/ai-onboarding/apis';
import type { AuthAccountInfo, AuthService } from '@affine/core/modules/cloud';
import type { GlobalDialogService } from '@affine/core/modules/dialogs';
import type { EditorSettingService } from '@affine/core/modules/editor-setting';
import {
  type AddContextFileInput,
  ContextCategories,
  type ContextWorkspaceEmbeddingStatus,
  type getCopilotHistoriesQuery,
  type QueryChatSessionsInput,
  type RequestOptions,
  type UpdateChatSessionInput,
} from '@affine/graphql';
import { z } from 'zod';

import { extractMarkdownFromDoc } from '../utils/extract';
import { AIProvider } from './ai-provider';
import { type CopilotClient, Endpoint } from './copilot-client';
import type { PromptKey } from './prompt';
import { textToText, toImage } from './request';
import { restTextToText } from './rest-client';
import { setupTracker } from './tracker';

function toAIUserInfo(account: AuthAccountInfo | null) {
  if (!account) return null;
  return {
    avatarUrl: account.avatar ?? '',
    email: account.email ?? '',
    id: account.id,
    name: account.label,
  };
}

const filterStyleToPromptName = new Map<string, PromptKey>(
  Object.entries({
    'Clay style': 'Convert to Clay style',
    'Pixel style': 'Convert to Pixel style',
    'Sketch style': 'Convert to Sketch style',
    'Anime style': 'Convert to Anime style',
  })
);

const processTypeToPromptName = new Map<string, PromptKey>(
  Object.entries({
    Clearer: 'Upscale image',
    'Remove background': 'Remove background',
    'Convert to sticker': 'Convert to sticker',
  })
);

export function setupAIProvider(
  client: CopilotClient,
  globalDialogService: GlobalDialogService,
  authService: AuthService,
  editorSettingService: EditorSettingService
) {
  async function createSession({
    promptName,
    workspaceId,
    docId,
    sessionId,
    retry,
    pinned,
    reuseLatestChat,
  }: BlockSuitePresets.AICreateSessionOptions) {
    if (sessionId) return sessionId;
    if (retry) return AIProvider.LAST_ACTION_SESSIONID;

    return client.createSession({
      workspaceId,
      docId,
      promptName,
      pinned,
      reuseLatestChat,
    });
  }

  AIProvider.provide('userInfo', () => {
    return toAIUserInfo(authService.session.account$.value);
  });

  const accountSubscription = authService.session.account$.subscribe(
    account => {
      AIProvider.slots.userInfo.next(toAIUserInfo(account));
    }
  );

  //#region actions
  AIProvider.provide('chat', async options => {
    const { input, contexts } = options;

    const sessionId = await createSession({
      promptName: 'Chat With AFFiNE AI',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId,
      client,
      sessionId,
      content: input,
      timeout: 5 * 60 * 1000, // 5 minutes
      params: {
        docs: contexts?.docs,
        files: contexts?.files,
        selectedSnapshot: contexts?.selectedSnapshot,
        selectedMarkdown: contexts?.selectedMarkdown,
        html: contexts?.html,
        ...(options.docId ? { currentDocId: options.docId } : {}),
      },
      endpoint: Endpoint.StreamObject,
    });
  });

  const systemPrompt =
    '你的名字叫周五，你是一位知识渊博且专业的智能助手，你被设计作为一款笔记编辑器的智能助手，你的任务是帮助用户完成笔记编辑相关的工作。注意使用 markdown 语法回答问题，必须遵循标准的 Markdown 语法（CommonMark）中，标记符号后的空格是必须的。';

  AIProvider.provide('summary', async options => {
    const includeFullDoc = editorSettingService.editorSetting.get(
      'aiChatIncludeFullDoc'
    );
    const docContent =
      includeFullDoc && options.host
        ? await extractMarkdownFromDoc(options.host.std.store)
        : '';
    return restTextToText({
      content: docContent
        ? `本笔记全文内容为：${docContent}\n\n请仅对主人选中内容："${options.input}"进行总结，如果选中的内容为非中文，总结结果也必须为非中文。要求：用简练的语言精准概括原文的核心主旨与关键结论，同时确保不遗漏重要信息。不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回总结结果。`
        : `请对主人选中内容："${options.input}"进行总结，如果选中的内容为非中文，总结结果也必须为非中文。要求：用简练的语言精准概括原文的核心主旨与关键结论，同时确保不遗漏重要信息。不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回总结结果。`,
      systemPrompt: systemPrompt,
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('translate', async options => {
    const includeFullDoc = editorSettingService.editorSetting.get(
      'aiChatIncludeFullDoc'
    );
    const docContent =
      includeFullDoc && options.host
        ? await extractMarkdownFromDoc(options.host.std.store)
        : '';
    return restTextToText({
      content: docContent
        ? `本笔记全文内容为：${docContent}\n\n请仅对主人选中内容："${options.input}"翻译为${options.lang}语言。要求：在准确理解原文语义与逻辑的基础上，摆脱逐字对译的束缚，用地道、通顺的目标语言重构出符合其表达习惯的完整段落。排版结构与原文保持一致，不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回翻译结果。`
        : `请对主人选中内容："${options.input}"翻译为${options.lang}语言。要求：在准确理解原文语义与逻辑的基础上，摆脱逐字对译的束缚，用地道、通顺的目标语言重构出符合其表达习惯的完整段落。排版结构与原文保持一致，不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回翻译结果。`,
      systemPrompt: systemPrompt,
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('changeTone', async options => {
    const includeFullDoc = editorSettingService.editorSetting.get(
      'aiChatIncludeFullDoc'
    );
    const docContent =
      includeFullDoc && options.host
        ? await extractMarkdownFromDoc(options.host.std.store)
        : '';
    return restTextToText({
      content: docContent
        ? `本笔记全文内容为：${docContent}\n\n请仅对主人选中内容："${options.input}"改写为更加${options.tone}的风格，如果选中的内容为非中文，改写结果也必须为非中文。要求：在深入理解并精准把握目标风格的语言特征与表达习惯的基础上，对原文进行从词汇、句式到整体语气的全面重构，使其呈现出截然不同的风貌与格调。不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回改写结果。`
        : `请对主人选中内容："${options.input}"改写为更加${options.tone}的风格，如果选中的内容为非中文，改写结果也必须为非中文。要求：在深入理解并精准把握目标风格的语言特征与表达习惯的基础上，对原文进行从词汇、句式到整体语气的全面重构，使其呈现出截然不同的风貌与格调。不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回改写结果。`,
      systemPrompt: systemPrompt,
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('improveWriting', async options => {
    const includeFullDoc = editorSettingService.editorSetting.get(
      'aiChatIncludeFullDoc'
    );
    const docContent =
      includeFullDoc && options.host
        ? await extractMarkdownFromDoc(options.host.std.store)
        : '';
    return restTextToText({
      content: docContent
        ? `全文内容为：${docContent}\n\n请对选中内容"${options.input}"进行润色，如果选中的内容为非中文，润色结果也必须为非中文。要求：在保持原文核心思想不变的前提下，通过优化遣词造句与逻辑衔接，使语言表达更加精准、流畅且富有感染力。不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回润色结果。`
        : `请对选中内容"${options.input}"进行润色，如果选中的内容为非中文，润色结果也必须为非中文。要求：在保持原文核心思想不变的前提下，通过优化遣词造句与逻辑衔接，使语言表达更加精准、流畅且富有感染力。不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回润色结果。`,
      systemPrompt: systemPrompt,
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('improveGrammar', async options => {
    const includeFullDoc = editorSettingService.editorSetting.get(
      'aiChatIncludeFullDoc'
    );
    const docContent =
      includeFullDoc && options.host
        ? await extractMarkdownFromDoc(options.host.std.store)
        : '';
    return restTextToText({
      content: docContent
        ? `全文内容为：${docContent}\n\n请对选中内容"${options.input}"进行语法纠正。要求：在严格保留原文原意的前提下，识别并纠正词序、搭配、成分及逻辑等方面的错误，确保句子结构完整、表达规范且通顺。排版结构与原文保持一致，不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回语法纠正结果。`
        : `请对选中内容"${options.input}"进行语法纠正。要求：在严格保留原文原意的前提下，识别并纠正词序、搭配、成分及逻辑等方面的错误，确保句子结构完整、表达规范且通顺。排版结构与原文保持一致，不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回语法纠正结果。`,
      systemPrompt: systemPrompt,
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('fixSpelling', async options => {
    const includeFullDoc = editorSettingService.editorSetting.get(
      'aiChatIncludeFullDoc'
    );
    const docContent =
      includeFullDoc && options.host
        ? await extractMarkdownFromDoc(options.host.std.store)
        : '';
    return restTextToText({
      content: docContent
        ? `全文内容为：${docContent}\n\n请对选中内容"${options.input}"进行错别字纠正。要求：在严格保留原文结构的前提下，识别并纠正错别字、拼写错误等。排版结构与原文保持一致，不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回错别字纠正结果。`
        : `请对选中内容"${options.input}"进行错别字纠正。要求：在严格保留原文结构的前提下，识别并纠正错别字、拼写错误等。排版结构与原文保持一致，不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回错别字纠正结果。`,
      systemPrompt: systemPrompt,
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('makeLonger', async options => {
    const includeFullDoc = editorSettingService.editorSetting.get(
      'aiChatIncludeFullDoc'
    );
    const docContent =
      includeFullDoc && options.host
        ? await extractMarkdownFromDoc(options.host.std.store)
        : '';
    return restTextToText({
      content: docContent
        ? `全文内容为：${docContent}\n\n请对选中内容"${options.input}"进行扩写。要求：在紧扣原文核心思想与逻辑框架的前提下，通过合理想象与细节填充，对内容进行丰富、拓展与深化，使其更加充实、饱满且富有层次感。不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回扩写结果。`
        : `请对选中内容"${options.input}"进行扩写。要求：在紧扣原文核心思想与逻辑框架的前提下，通过合理想象与细节填充，对内容进行丰富、拓展与深化，使其更加充实、饱满且富有层次感。不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回扩写结果。`,
      systemPrompt: systemPrompt,
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('makeShorter', async options => {
    const includeFullDoc = editorSettingService.editorSetting.get(
      'aiChatIncludeFullDoc'
    );
    const docContent =
      includeFullDoc && options.host
        ? await extractMarkdownFromDoc(options.host.std.store)
        : '';
    return restTextToText({
      content: docContent
        ? `全文内容为：${docContent}\n\n请对选中内容"${options.input}"进行缩写。要求：在保持原文中心思想、主要人物和关键情节不变的前提下，通过删除次要细节、概括具体描写、合并同类信息，将长篇文章精炼为结构完整、文意连贯的短文。不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回缩写结果。`
        : `请对选中内容"${options.input}"进行缩写。要求：在保持原文中心思想、主要人物和关键情节不变的前提下，通过删除次要细节、概括具体描写、合并同类信息，将长篇文章精炼为结构完整、文意连贯的短文。不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回缩写结果。`,
      systemPrompt: systemPrompt,
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('explain', async options => {
    const includeFullDoc = editorSettingService.editorSetting.get(
      'aiChatIncludeFullDoc'
    );
    const docContent =
      includeFullDoc && options.host
        ? await extractMarkdownFromDoc(options.host.std.store)
        : '';
    return restTextToText({
      content: docContent
        ? `全文内容为：${docContent}\n\n请对选中内容"${options.input}"进行解释。要求：在清晰呈现事实与现象的基础上，深入揭示其背后的成因、逻辑与内在关联，帮助他人不仅知道“是什么”，更能理解“为什么”，内容不要过于冗余与详细。不要携带其他无关的多余的语气词或者额外的文本，只允许使用纯文本返回解释结果。`
        : `请对选中内容"${options.input}"进行解释。要求：在清晰呈现事实与现象的基础上，深入揭示其背后的成因、逻辑与内在关联，帮助他人不仅知道“是什么”，更能理解“为什么”，内容不要过于冗余与详细。不要携带其他无关的多余的语气词或者额外的文本，只允许使用纯文本返回解释结果。`,
      systemPrompt: systemPrompt,
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('continueWriting', async options => {
    const includeFullDoc = editorSettingService.editorSetting.get(
      'aiChatIncludeFullDoc'
    );
    const docContent =
      includeFullDoc && options.host
        ? await extractMarkdownFromDoc(options.host.std.store)
        : '';
    return restTextToText({
      content: docContent
        ? `全文内容为：${docContent}\n\n请对选中内容"${options.input}"进行解释。要求：在精准捕捉原文的逻辑脉络、核心意象或叙事基调的基础上，顺应其内在的发展趋势进行合理延伸，确保新增内容与前文在思维路径和整体氛围上浑然一体，无逻辑断层。不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回解释结果。`
        : `请对选中内容"${options.input}"进行续写。要求：在精准捕捉原文的逻辑脉络、核心意象或叙事基调的基础上，顺应其内在的发展趋势进行合理延伸，确保新增内容与前文在思维路径和整体氛围上浑然一体，无逻辑断层。不要携带其他无关的多余的语气词或者额外的文本，使用 markdown 格式返回续写结果。`,
      systemPrompt: systemPrompt,
      stream: options.stream,
      signal: options.signal,
    });
  });
  //#endregion

  AIProvider.provide('createHeadings', async options => {
    const sessionId = await createSession({
      promptName: 'Create headings',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('checkCodeErrors', async options => {
    const sessionId = await createSession({
      promptName: 'Check code error',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('explainCode', async options => {
    const sessionId = await createSession({
      promptName: 'Explain this code',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('writeArticle', async options => {
    const sessionId = await createSession({
      promptName: 'Write an article about this',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('writeTwitterPost', async options => {
    const sessionId = await createSession({
      promptName: 'Write a twitter about this',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('writePoem', async options => {
    const sessionId = await createSession({
      promptName: 'Write a poem about this',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('writeOutline', async options => {
    const sessionId = await createSession({
      promptName: 'Write outline',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('writeBlogPost', async options => {
    const sessionId = await createSession({
      promptName: 'Write a blog post about this',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('brainstorm', async options => {
    const sessionId = await createSession({
      promptName: 'Brainstorm ideas about this',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('findActions', async options => {
    const sessionId = await createSession({
      promptName: 'Find action items from it',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('brainstormMindmap', async options => {
    const sessionId = await createSession({
      promptName: 'workflow:brainstorm',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
      // 3 minutes
      timeout: 180000,
      endpoint: Endpoint.Workflow,
    });
  });

  AIProvider.provide('expandMindmap', async options => {
    if (!options.input) {
      throw new Error('expandMindmap action requires input');
    }
    const sessionId = await createSession({
      promptName: 'Expand mind map',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      params: {
        mindmap: options.mindmap,
        node: options.input,
      },
      content: options.input,
    });
  });

  AIProvider.provide('explainImage', async options => {
    const sessionId = await createSession({
      promptName: 'Explain this image',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('makeItReal', async options => {
    let promptName: PromptKey = 'Make it real';
    let content = options.input || '';

    // wireframes
    if (options.attachments?.length) {
      content = `Here are the latest wireframes. Could you make a new website based on these wireframes and notes and send back just the html file?
Here are our design notes:\n ${content}.`;
    } else {
      // notes
      promptName = 'Make it real with text';
      content = `Here are the latest notes: \n ${content}.
Could you make a new website based on these notes and send back just the html file?`;
    }

    const sessionId = await createSession({
      promptName,
      ...options,
    });

    return textToText({
      ...options,
      client,
      sessionId,
      content,
    });
  });

  AIProvider.provide('createSlides', async options => {
    const SlideSchema = z.object({
      page: z.number(),
      type: z.enum(['name', 'title', 'content']),
      content: z.string(),
    });
    type Slide = z.infer<typeof SlideSchema>;
    const parseJson = (json: string) => {
      try {
        return SlideSchema.parse(JSON.parse(json));
      } catch {
        return null;
      }
    };
    // TODO(@darkskygit): move this to backend's workflow after workflow support custom code action
    const postfix = (text: string): string => {
      const slides = text
        .split('\n')
        .map(parseJson)
        .filter((v): v is Slide => !!v);
      return slides
        .map(slide => {
          if (slide.type === 'name') {
            return `- ${slide.content}`;
          } else if (slide.type === 'title') {
            return `  - ${slide.content}`;
          } else if (slide.content.includes('\n')) {
            return slide.content
              .split('\n')
              .map(c => `    - ${c}`)
              .join('\n');
          } else {
            return `    - ${slide.content}`;
          }
        })
        .join('\n');
    };
    const sessionId = await createSession({
      promptName: 'workflow:presentation',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
      // 3 minutes
      timeout: 180000,
      endpoint: Endpoint.Workflow,
      postfix,
    });
  });

  AIProvider.provide('createImage', async options => {
    const sessionId = await createSession({
      promptName: 'Generate image',
      ...options,
    });
    return toImage({
      ...options,
      client,
      sessionId,
      content:
        !options.input && options.attachments
          ? 'Make the image more detailed.'
          : options.input,
      // 5 minutes
      timeout: 300000,
    });
  });

  AIProvider.provide('filterImage', async options => {
    // test to image
    const promptName: PromptKey | undefined = filterStyleToPromptName.get(
      options.style
    );
    if (!promptName) {
      throw new Error('filterImage requires a promptName');
    }
    const sessionId = await createSession({
      promptName,
      ...options,
    });
    const isWorkflow = !!promptName?.startsWith('workflow:');
    return toImage({
      ...options,
      client,
      sessionId,
      content: options.input,
      timeout: 180000,
      endpoint: isWorkflow ? Endpoint.Workflow : Endpoint.Images,
    });
  });

  AIProvider.provide('processImage', async options => {
    // test to image
    const promptName: PromptKey | undefined = processTypeToPromptName.get(
      options.type
    );
    if (!promptName) {
      throw new Error('processImage requires a promptName');
    }
    const sessionId = await createSession({
      promptName,
      ...options,
    });
    return toImage({
      ...options,
      client,
      sessionId,
      content: options.input,
      timeout: 180000,
    });
  });

  AIProvider.provide('generateCaption', async options => {
    const sessionId = await createSession({
      promptName: 'Generate a caption',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('session', {
    createSession,
    createSessionWithHistory: async options => {
      if (!options.sessionId && !options.retry) {
        return client.createSessionWithHistory({
          workspaceId: options.workspaceId,
          docId: options.docId,
          promptName: options.promptName,
          pinned: options.pinned,
          reuseLatestChat: options.reuseLatestChat,
        });
      }

      const sessionId = await createSession(options);
      if (!sessionId) return undefined;
      return client.getSession(options.workspaceId, sessionId);
    },
    getSession: async (workspaceId: string, sessionId: string) => {
      return client.getSession(workspaceId, sessionId);
    },
    getSessions: async (
      workspaceId: string,
      docId?: string,
      options?: QueryChatSessionsInput
    ) => {
      return client.getSessions(workspaceId, {}, docId, options);
    },
    getRecentSessions: async (
      workspaceId: string,
      limit?: number,
      offset?: number
    ) => {
      return client.getRecentSessions(workspaceId, limit, offset);
    },
    updateSession: async (options: UpdateChatSessionInput) => {
      return client.updateSession(options);
    },
  });

  AIProvider.provide('context', {
    createContext: async (workspaceId: string, sessionId: string) => {
      return client.createContext(workspaceId, sessionId);
    },
    getContextId: async (workspaceId: string, sessionId: string) => {
      return client.getContextId(workspaceId, sessionId);
    },
    addContextDoc: async (options: { contextId: string; docId: string }) => {
      return client.addContextDoc(options);
    },
    removeContextDoc: async (options: { contextId: string; docId: string }) => {
      return client.removeContextDoc(options);
    },
    addContextFile: async (file: File, options: AddContextFileInput) => {
      return client.addContextFile(file, options);
    },
    removeContextFile: async (options: {
      contextId: string;
      fileId: string;
    }) => {
      return client.removeContextFile(options);
    },
    addContextTag: async (options: {
      contextId: string;
      tagId: string;
      docIds: string[];
    }) => {
      return client.addContextCategory({
        contextId: options.contextId,
        type: ContextCategories.Tag,
        categoryId: options.tagId,
        docs: options.docIds,
      });
    },
    removeContextTag: async (options: { contextId: string; tagId: string }) => {
      return client.removeContextCategory({
        contextId: options.contextId,
        type: ContextCategories.Tag,
        categoryId: options.tagId,
      });
    },
    addContextCollection: async (options: {
      contextId: string;
      collectionId: string;
      docIds: string[];
    }) => {
      return client.addContextCategory({
        contextId: options.contextId,
        type: ContextCategories.Collection,
        categoryId: options.collectionId,
        docs: options.docIds,
      });
    },
    removeContextCollection: async (options: {
      contextId: string;
      collectionId: string;
    }) => {
      return client.removeContextCategory({
        contextId: options.contextId,
        type: ContextCategories.Collection,
        categoryId: options.collectionId,
      });
    },
    getContextDocsAndFiles: async (
      workspaceId: string,
      sessionId: string,
      contextId: string
    ) => {
      return client.getContextDocsAndFiles(workspaceId, sessionId, contextId);
    },
    pollContextDocsAndFiles: async (
      workspaceId: string,
      sessionId: string,
      contextId: string,
      onPoll: (
        result: BlockSuitePresets.AIDocsAndFilesContext | undefined
      ) => void,
      abortSignal: AbortSignal
    ) => {
      const poll = async () => {
        const result = await client.getContextDocsAndFiles(
          workspaceId,
          sessionId,
          contextId
        );
        onPoll(result);
      };

      let attempts = 0;
      const MIN_INTERVAL = 1000;
      const MAX_INTERVAL = 30 * 1000;

      while (!abortSignal.aborted) {
        await poll();
        const interval = Math.min(
          MIN_INTERVAL * Math.pow(1.5, attempts),
          MAX_INTERVAL
        );
        attempts++;
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    },
    pollEmbeddingStatus: async (
      workspaceId: string,
      onPoll: (result: ContextWorkspaceEmbeddingStatus) => void,
      abortSignal: AbortSignal
    ) => {
      const poll = async () => {
        const result = await client.getEmbeddingStatus(workspaceId);
        onPoll(result);
      };

      const INTERVAL = 10 * 1000;

      while (!abortSignal.aborted) {
        await poll();
        await new Promise(resolve => setTimeout(resolve, INTERVAL));
      }
    },
    matchContext: async (
      content: string,
      contextId?: string,
      workspaceId?: string,
      limit?: number,
      scopedThreshold?: number,
      threshold?: number
    ) => {
      return client.matchContext(
        content,
        contextId,
        workspaceId,
        limit,
        scopedThreshold,
        threshold
      );
    },
    applyDocUpdates: async (
      workspaceId: string,
      docId: string,
      op: string,
      updates: string
    ) => {
      return client.applyDocUpdates(workspaceId, docId, op, updates);
    },
    addContextBlob: async (options: { blobId: string; contextId: string }) => {
      return client.addContextBlob({
        contextId: options.contextId,
        blobId: options.blobId,
      });
    },
    removeContextBlob: async (options: {
      blobId: string;
      contextId: string;
    }) => {
      return client.removeContextBlob({
        contextId: options.contextId,
        blobId: options.blobId,
      });
    },
  });

  AIProvider.provide('histories', {
    actions: async (
      workspaceId: string,
      docId: string
    ): Promise<BlockSuitePresets.AIHistory[]> => {
      // @ts-expect-error - 'action' is missing in server impl
      return (
        (await client.getHistories(workspaceId, {}, docId, {
          action: true,
          withPrompt: true,
          withMessages: true,
        })) ?? []
      );
    },
    chats: async (
      workspaceId: string,
      sessionId: string,
      docId?: string
    ): Promise<BlockSuitePresets.AIHistory[]> => {
      // @ts-expect-error - 'action' is missing in server impl
      return (
        (await client.getHistories(workspaceId, {}, docId, {
          sessionId,
          withMessages: true,
        })) ?? []
      );
    },
    cleanup: async (
      workspaceId: string,
      docId: string | undefined,
      sessionIds: string[]
    ) => {
      await client.cleanupSessions({ workspaceId, docId, sessionIds });
    },
    ids: async (
      workspaceId: string,
      docId?: string,
      options?: RequestOptions<
        typeof getCopilotHistoriesQuery
      >['variables']['options']
    ): Promise<BlockSuitePresets.AIHistoryIds[]> => {
      // @ts-expect-error - 'action' is missing in server impl
      return await client.getHistoryIds(workspaceId, {}, docId, options);
    },
  });

  AIProvider.provide('photoEngine', {
    async searchImages(options): Promise<string[]> {
      let url = '/api/copilot/unsplash/photos';
      if (options.query) {
        url += `?query=${encodeURIComponent(options.query)}`;
      }
      const result: {
        results?: {
          urls: {
            regular: string;
          };
        }[];
      } = await fetch(url.toString()).then((res: Response) => res.json());
      if (!result.results) return [];
      return result.results.map(r => {
        const url = new URL(r.urls.regular);
        url.searchParams.set('fit', 'crop');
        url.searchParams.set('crop', 'edges');
        url.searchParams.set('dpr', (window.devicePixelRatio ?? 2).toString());
        url.searchParams.set('w', `${options.width}`);
        url.searchParams.set('h', `${options.height}`);
        return url.toString();
      });
    },
  });

  AIProvider.provide('onboarding', toggleGeneralAIOnboarding);

  AIProvider.provide('forkChat', options => {
    return client.forkSession(options);
  });

  const disposeRequestLoginHandler = AIProvider.slots.requestLogin.subscribe(
    () => {
      globalDialogService.open('sign-in', {});
    }
  );

  setupTracker();

  return () => {
    disposeRequestLoginHandler.unsubscribe();
    accountSubscription.unsubscribe();
  };
}
