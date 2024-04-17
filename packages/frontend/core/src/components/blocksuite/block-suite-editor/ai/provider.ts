import { openSettingModalAtom } from '@affine/core/atoms';
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

  AIProvider.provide('chat', options => {
    const sessionId = getChatSessionId(options.workspaceId, options.docId);
    return textToText({
      ...options,
      content: options.input,
      sessionId,
    });
  });

  AIProvider.provide('summary', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Summary',
    });
  });

  AIProvider.provide('translate', options => {
    return textToText({
      ...options,
      promptName: 'Translate to',
      content: options.input,
      params: {
        language: options.lang,
      },
    });
  });

  AIProvider.provide('changeTone', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Change tone to',
    });
  });

  AIProvider.provide('improveWriting', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Improve writing for it',
    });
  });

  AIProvider.provide('improveGrammar', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Improve grammar for it',
    });
  });

  AIProvider.provide('fixSpelling', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Fix spelling for it',
    });
  });

  AIProvider.provide('createHeadings', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Create headings',
    });
  });

  AIProvider.provide('makeLonger', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Make it longer',
    });
  });

  AIProvider.provide('makeShorter', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Make it shorter',
    });
  });

  AIProvider.provide('checkCodeErrors', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Check code error',
    });
  });

  AIProvider.provide('explainCode', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Explain this code',
    });
  });

  AIProvider.provide('writeArticle', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Write an article about this',
    });
  });

  AIProvider.provide('writeTwitterPost', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Write a twitter about this',
    });
  });

  AIProvider.provide('writePoem', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Write a poem about this',
    });
  });

  AIProvider.provide('writeOutline', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Write outline',
    });
  });

  AIProvider.provide('writeBlogPost', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Write a blog post about this',
    });
  });

  AIProvider.provide('brainstorm', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Brainstorm ideas about this',
    });
  });

  AIProvider.provide('findActions', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Find action items from it',
    });
  });

  AIProvider.provide('brainstormMindmap', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Brainstorm mindmap',
    });
  });

  AIProvider.provide('explain', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Explain this',
    });
  });

  AIProvider.provide('explainImage', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Explain this image',
    });
  });

  AIProvider.provide('makeItReal', options => {
    return textToText({
      ...options,
      promptName: 'Make it real',
      params: options.params,
      content:
        options.content ||
        'Here are the latest wireframes. Could you make a new website based on these wireframes and notes and send back just the html file?',
    });
  });

  AIProvider.provide('createSlides', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Create a presentation',
    });
  });

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

  AIProvider.provide('createImage', options => {
    // test to image
    let promptName: PromptKey = 'debug:action:dalle3';
    // image to image
    if (options.attachments?.length) {
      promptName = 'debug:action:fal-sd15';
    }
    return toImage({
      ...options,
      promptName,
      forceToImage: true,
    });
  });

  AIProvider.slots.requestUpgradePlan.on(() => {
    getCurrentStore().set(openSettingModalAtom, {
      activeTab: 'billing',
      open: true,
    });
  });
}
