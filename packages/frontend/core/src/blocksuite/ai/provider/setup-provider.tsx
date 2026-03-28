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
import { RestCopilotClient, restTextToText } from './rest-client';
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
  const restClient = new RestCopilotClient();

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
    const { input, stream, signal } = options;

    const sessionId: string = options.sessionId ?? `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    return {
      [Symbol.asyncIterator]: async function* () {
        const result = await restClient.createSessionAndChat(
          sessionId,
          {
            role: 'user',
            content: input || '',
          },
          {
            signal,
            timeout: 5 * 60 * 1000,
          }
        );

        AIProvider.LAST_ACTION_SESSIONID = sessionId;

        for await (const chunk of result) {
          yield chunk;
        }
      },
    };
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
    return restTextToText({
      content: options.input || '',
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('checkCodeErrors', async options => {
    return restTextToText({
      content: options.input || '',
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('explainCode', async options => {
    return restTextToText({
      content: options.input || '',
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('writeArticle', async options => {
    return restTextToText({
      content: options.input || '',
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('writeTwitterPost', async options => {
    return restTextToText({
      content: options.input || '',
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('writePoem', async options => {
    return restTextToText({
      content: options.input || '',
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('writeOutline', async options => {
    return restTextToText({
      content: options.input || '',
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('writeBlogPost', async options => {
    return restTextToText({
      content: options.input || '',
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('brainstorm', async options => {
    return restTextToText({
      content: options.input || '',
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('findActions', async options => {
    return restTextToText({
      content: options.input || '',
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('brainstormMindmap', async options => {
    return restTextToText({
      content: options.input || '',
      stream: options.stream,
      signal: options.signal,
      timeout: 180000,
    });
  });

  AIProvider.provide('expandMindmap', async options => {
    if (!options.input) {
      throw new Error('expandMindmap action requires input');
    }
    return restTextToText({
      content: `Mindmap: ${options.mindmap}\n\nNode to expand: ${options.input}`,
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('explainImage', async options => {
    return restTextToText({
      content: options.input || '',
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('makeItReal', async options => {
    let content = options.input || '';

    if (options.attachments?.length) {
      content = `Here are the latest wireframes. Could you make a new website based on these wireframes and notes and send back just the html file?
Here are our design notes:\n ${content}.`;
    } else {
      content = `Here are the latest notes: \n ${content}.
Could you make a new website based on these notes and send back just the html file?`;
    }

    return restTextToText({
      content,
      stream: options.stream,
      signal: options.signal,
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

    const result = await restTextToText({
      content: options.input || '',
      stream: false,
      signal: options.signal,
      timeout: 180000,
    });

    if (typeof result === 'string') {
      return postfix(result);
    }
    return result;
  });

  AIProvider.provide('createImage', async options => {
    return restTextToText({
      content: !options.input && options.attachments
        ? 'Make the image more detailed.'
        : options.input || '',
      stream: options.stream,
      signal: options.signal,
      timeout: 300000,
    });
  });

  AIProvider.provide('filterImage', async options => {
    const promptName: PromptKey | undefined = filterStyleToPromptName.get(
      options.style
    );
    if (!promptName) {
      throw new Error('filterImage requires a promptName');
    }
    return restTextToText({
      content: options.input || '',
      stream: options.stream,
      signal: options.signal,
      timeout: 180000,
    });
  });

  AIProvider.provide('processImage', async options => {
    const promptName: PromptKey | undefined = processTypeToPromptName.get(
      options.type
    );
    if (!promptName) {
      throw new Error('processImage requires a promptName');
    }
    return restTextToText({
      content: options.input || '',
      stream: options.stream,
      signal: options.signal,
      timeout: 180000,
    });
  });

  AIProvider.provide('generateCaption', async options => {
    return restTextToText({
      content: options.input || '',
      stream: options.stream,
      signal: options.signal,
    });
  });

  AIProvider.provide('session', {
    createSession: async (options: BlockSuitePresets.AICreateSessionOptions) => {
      return options.sessionId || `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    },
    createSessionWithHistory: async (options: BlockSuitePresets.AICreateSessionOptions) => {
      if (options.sessionId) {
        const sessionDetail = await restClient.getSession(options.sessionId);
        return {
          sessionId: sessionDetail.id,
          workspaceId: '',
          docId: null,
          parentSessionId: null,
          promptName: options.promptName || 'Chat With AFFiNE AI',
          model: 'qwen',
          optionalModels: [],
          action: null,
          pinned: false,
          title: sessionDetail.title,
          tokens: 0,
          createdAt: sessionDetail.created_at,
          updatedAt: sessionDetail.created_at,
          messages: sessionDetail.messages.map((msg, idx) => ({
            id: `msg-${idx}`,
            role: msg.role,
            content: msg.content,
            attachments: null,
            createdAt: sessionDetail.created_at,
            streamObjects: null,
          })),
        };
      }

      const sessions = await restClient.getSessions();
      if (sessions.length > 0 && options.reuseLatestChat !== false) {
        const latestSession = sessions[0];
        const sessionDetail = await restClient.getSession(latestSession.id);
        return {
          sessionId: sessionDetail.id,
          workspaceId: '',
          docId: null,
          parentSessionId: null,
          promptName: options.promptName || 'Chat With AFFiNE AI',
          model: 'qwen',
          optionalModels: [],
          action: null,
          pinned: false,
          title: sessionDetail.title,
          tokens: 0,
          createdAt: sessionDetail.created_at,
          updatedAt: sessionDetail.created_at,
          messages: sessionDetail.messages.map((msg, idx) => ({
            id: `msg-${idx}`,
            role: msg.role,
            content: msg.content,
            attachments: null,
            createdAt: sessionDetail.created_at,
            streamObjects: null,
          })),
        };
      }

      const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      return {
        sessionId: newSessionId,
        workspaceId: '',
        docId: null,
        parentSessionId: null,
        promptName: options.promptName || 'Chat With AFFiNE AI',
        model: 'qwen',
        optionalModels: [],
        action: null,
        pinned: false,
        title: null,
        tokens: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
    },
    getSession: async (workspaceId: string, sessionId: string) => {
      const sessionDetail = await restClient.getSession(sessionId);
      return {
        sessionId: sessionDetail.id,
        workspaceId: workspaceId,
        docId: null,
        parentSessionId: null,
        promptName: 'Chat With AFFiNE AI',
        model: 'qwen',
        optionalModels: [],
        action: null,
        pinned: false,
        title: sessionDetail.title,
        tokens: 0,
        createdAt: sessionDetail.created_at,
        updatedAt: sessionDetail.created_at,
        messages: sessionDetail.messages.map((msg, idx) => ({
          id: `msg-${idx}`,
          role: msg.role,
          content: msg.content,
          attachments: null,
          createdAt: sessionDetail.created_at,
          streamObjects: null,
        })),
      };
    },
    getSessions: async (
      workspaceId: string,
      docId?: string,
      options?: QueryChatSessionsInput
    ) => {
      const sessions = await restClient.getSessions();
      return sessions.map(session => ({
        sessionId: session.id,
        workspaceId: workspaceId,
        docId: docId || null,
        parentSessionId: null,
        promptName: 'Chat With AFFiNE AI',
        model: 'qwen',
        optionalModels: [],
        action: null,
        pinned: false,
        title: session.title,
        tokens: 0,
        createdAt: session.created_at,
        updatedAt: session.created_at,
        messages: [],
      }));
    },
    getRecentSessions: async (
      workspaceId: string,
      limit?: number,
      offset?: number
    ) => {
      const sessions = await restClient.getSessions();
      return sessions.slice(offset || 0, (offset || 0) + (limit || 20)).map(session => ({
        sessionId: session.id,
        workspaceId: workspaceId,
        docId: null,
        parentSessionId: null,
        promptName: 'Chat With AFFiNE AI',
        model: 'qwen',
        optionalModels: [],
        action: null,
        pinned: false,
        title: session.title,
        tokens: 0,
        createdAt: session.created_at,
        updatedAt: session.created_at,
        messages: [],
      }));
    },
    updateSession: async (options: UpdateChatSessionInput) => {
      return options.sessionId;
    },
    deleteSession: async (workspaceId: string, sessionId: string) => {
      await restClient.deleteSession(sessionId);
    },
  });

  AIProvider.provide('context', {
    createContext: async (workspaceId: string, sessionId: string) => {
      return `context-${sessionId}`;
    },
    getContextId: async (workspaceId: string, sessionId: string) => {
      return `context-${sessionId}`;
    },
    addContextDoc: async (options: { contextId: string; docId: string }) => {
      return {} as any;
    },
    removeContextDoc: async (options: { contextId: string; docId: string }) => {
      return true;
    },
    addContextFile: async (file: File, options: AddContextFileInput) => {
      return {} as any;
    },
    removeContextFile: async (options: {
      contextId: string;
      fileId: string;
    }) => {
      return true;
    },
    addContextTag: async (options: {
      contextId: string;
      tagId: string;
      docIds: string[];
    }) => {
      return {} as any;
    },
    removeContextTag: async (options: { contextId: string; tagId: string }) => {
      return true;
    },
    addContextCollection: async (options: {
      contextId: string;
      collectionId: string;
      docIds: string[];
    }) => {
      return {} as any;
    },
    removeContextCollection: async (options: {
      contextId: string;
      collectionId: string;
    }) => {
      return true;
    },
    getContextDocsAndFiles: async (
      workspaceId: string,
      sessionId: string,
      contextId: string
    ) => {
      return undefined;
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
      return;
    },
    pollEmbeddingStatus: async (
      workspaceId: string,
      onPoll: (result: ContextWorkspaceEmbeddingStatus) => void,
      abortSignal: AbortSignal
    ) => {
      return;
    },
    matchContext: async (
      content: string,
      contextId?: string,
      workspaceId?: string,
      limit?: number,
      scopedThreshold?: number,
      threshold?: number
    ) => {
      return { files: [], docs: [] };
    },
    applyDocUpdates: async (
      workspaceId: string,
      docId: string,
      op: string,
      updates: string
    ) => {
      return '';
    },
    addContextBlob: async (options: { blobId: string; contextId: string }) => {
      return {} as any;
    },
    removeContextBlob: async (options: {
      blobId: string;
      contextId: string;
    }) => {
      return true;
    },
  });

  AIProvider.provide('histories', {
    actions: async (
      workspaceId: string,
      docId: string
    ): Promise<BlockSuitePresets.AIHistory[]> => {
      return [];
    },
    chats: async (
      workspaceId: string,
      sessionId: string,
      docId?: string
    ): Promise<BlockSuitePresets.AIHistory[]> => {
      try {
        const sessionDetail = await restClient.getSession(sessionId);
        return [{
          sessionId: sessionDetail.id,
          tokens: 0,
          action: null,
          createdAt: sessionDetail.created_at,
          messages: sessionDetail.messages.map((msg, idx) => ({
            id: `msg-${idx}`,
            content: msg.content,
            createdAt: sessionDetail.created_at,
            role: msg.role as 'user' | 'assistant',
            attachments: null,
            streamObjects: null,
          })),
        }];
      } catch (err) {
        return [];
      }
    },
    cleanup: async (
      workspaceId: string,
      docId: string | undefined,
      sessionIds: string[]
    ) => {
      for (const sessionId of sessionIds) {
        try {
          await restClient.deleteSession(sessionId);
        } catch (err) {
          console.error('Failed to delete session:', sessionId, err);
        }
      }
    },
    ids: async (
      workspaceId: string,
      docId?: string,
      options?: RequestOptions<
        typeof getCopilotHistoriesQuery
      >['variables']['options']
    ): Promise<BlockSuitePresets.AIHistoryIds[]> => {
      const sessions = await restClient.getSessions();
      return sessions.map(session => ({
        sessionId: session.id,
        messages: [],
      }));
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
    return `session-${Date.now()}-fork-${options.sessionId}`;
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
