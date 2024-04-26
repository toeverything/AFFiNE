import { authAtom, openSettingModalAtom } from '@affine/core/atoms';
import { mixpanel } from '@affine/core/utils';
import { getBaseUrl } from '@affine/graphql';
import { assertExists } from '@blocksuite/global/utils';
import { AIProvider } from '@blocksuite/presets';
import { getCurrentStore } from '@toeverything/infra';

import type { PromptKey } from './prompt';
import {
  createChatSession,
  listHistories,
  textToText,
  toImage,
} from './request';

type AIAction = keyof BlockSuitePresets.AIActions;

const TRACKED_ACTIONS: Record<AIAction, boolean> = {
  chat: true,
  summary: true,
  translate: true,
  changeTone: true,
  improveWriting: true,
  improveGrammar: true,
  fixSpelling: true,
  createHeadings: true,
  makeLonger: true,
  makeShorter: true,
  checkCodeErrors: true,
  explainCode: true,
  writeArticle: true,
  writeTwitterPost: true,
  writePoem: true,
  writeOutline: true,
  writeBlogPost: true,
  brainstorm: true,
  findActions: true,
  brainstormMindmap: true,
  explain: true,
  explainImage: true,
  makeItReal: true,
  createSlides: true,
  createImage: true,
  expandMindmap: true,
  continueWriting: true,
};

const provideAction = <T extends AIAction>(
  id: T,
  action: (
    ...options: Parameters<BlockSuitePresets.AIActions[T]>
  ) => ReturnType<BlockSuitePresets.AIActions[T]>
) => {
  if (TRACKED_ACTIONS[id]) {
    const wrappedFn: typeof action = (opts, ...rest) => {
      mixpanel.track('AI', {
        resolve: id,
        docId: opts.docId,
        workspaceId: opts.workspaceId,
      });
      // @ts-expect-error - todo: add a middleware in blocksuite instead?
      return action(opts, ...rest);
    };
    AIProvider.provide(id, wrappedFn);
  } else {
    AIProvider.provide(id, action);
  }
};

export function setupAIProvider() {
  // a single workspace should have only a single chat session
  // workspace-id:doc-id -> chat session id
  const chatSessions = new Map<string, Promise<string>>();

  async function getChatSessionId(workspaceId: string, docId: string) {
    const storeKey = `${workspaceId}:${docId}`;
    if (!chatSessions.has(storeKey)) {
      chatSessions.set(
        storeKey,
        createChatSession({
          workspaceId,
          docId,
        })
      );
    }
    const sessionId = await chatSessions.get(storeKey);
    assertExists(sessionId);
    return sessionId;
  }

  //#region actions
  provideAction('chat', options => {
    const sessionId = getChatSessionId(options.workspaceId, options.docId);
    return textToText({
      ...options,
      content: options.input,
      sessionId,
    });
  });

  provideAction('summary', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Summary',
    });
  });

  provideAction('translate', options => {
    return textToText({
      ...options,
      promptName: 'Translate to',
      content: options.input,
      params: {
        language: options.lang,
      },
    });
  });

  provideAction('changeTone', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Change tone to',
    });
  });

  provideAction('improveWriting', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Improve writing for it',
    });
  });

  provideAction('improveGrammar', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Improve grammar for it',
    });
  });

  provideAction('fixSpelling', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Fix spelling for it',
    });
  });

  provideAction('createHeadings', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Create headings',
    });
  });

  provideAction('makeLonger', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Make it longer',
    });
  });

  provideAction('makeShorter', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Make it shorter',
    });
  });

  provideAction('checkCodeErrors', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Check code error',
    });
  });

  provideAction('explainCode', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Explain this code',
    });
  });

  provideAction('writeArticle', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Write an article about this',
    });
  });

  provideAction('writeTwitterPost', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Write a twitter about this',
    });
  });

  provideAction('writePoem', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Write a poem about this',
    });
  });

  provideAction('writeOutline', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Write outline',
    });
  });

  provideAction('writeBlogPost', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Write a blog post about this',
    });
  });

  provideAction('brainstorm', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Brainstorm ideas about this',
    });
  });

  provideAction('findActions', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Find action items from it',
    });
  });

  provideAction('brainstormMindmap', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Brainstorm mindmap',
    });
  });

  provideAction('expandMindmap', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Expand mind map',
    });
  });

  provideAction('explain', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Explain this',
    });
  });

  provideAction('explainImage', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Explain this image',
    });
  });

  provideAction('makeItReal', options => {
    return textToText({
      ...options,
      promptName: 'Make it real',
      params: options.params,
      content:
        options.content ||
        'Here are the latest wireframes. Could you make a new website based on these wireframes and notes and send back just the html file?',
    });
  });

  provideAction('createSlides', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Create a presentation',
    });
  });

  provideAction('createImage', options => {
    // test to image
    let promptName: PromptKey = 'debug:action:dalle3';
    // image to image
    if (options.attachments?.length) {
      promptName = 'debug:action:fal-sd15';
    }
    return toImage({
      ...options,
      promptName,
    });
  });

  provideAction('continueWriting', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Continue writing',
    });
  });
  //#endregion

  AIProvider.provide('histories', {
    actions: async (
      workspaceId: string,
      docId?: string
    ): Promise<BlockSuitePresets.AIHistory[]> => {
      // @ts-expect-error - 'action' is missing in server impl
      return (
        (await listHistories(workspaceId, docId, {
          action: true,
        })) ?? []
      );
    },
    chats: async (
      workspaceId: string,
      docId?: string
    ): Promise<BlockSuitePresets.AIHistory[]> => {
      // @ts-expect-error - 'action' is missing in server impl
      return (await listHistories(workspaceId, docId)) ?? [];
    },
  });

  AIProvider.provide('photoEngine', {
    async searchImages(options): Promise<string[]> {
      const url = new URL(getBaseUrl() + '/api/copilot/unsplash/photos');
      url.searchParams.set('query', options.query);
      const result: {
        results: {
          urls: {
            regular: string;
          };
        }[];
      } = await fetch(url.toString()).then(res => res.json());
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

  AIProvider.slots.requestUpgradePlan.on(() => {
    mixpanel.track('AI', {
      action: 'requestUpgradePlan',
    });
    getCurrentStore().set(openSettingModalAtom, {
      activeTab: 'billing',
      open: true,
    });
  });

  AIProvider.slots.requestLogin.on(() => {
    mixpanel.track('AI', {
      action: 'requestLogin',
    });
    getCurrentStore().set(authAtom, s => ({
      ...s,
      openModal: true,
    }));
  });
}
