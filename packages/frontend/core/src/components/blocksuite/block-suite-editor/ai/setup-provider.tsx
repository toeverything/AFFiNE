import { notify } from '@affine/component';
import { AIProvider } from '@affine/core/blocksuite/presets/ai';
import { toggleGeneralAIOnboarding } from '@affine/core/components/affine/ai-onboarding/apis';
import { authAtom, openSettingModalAtom } from '@affine/core/components/atoms';
import {
  getBaseUrl,
  type getCopilotHistoriesQuery,
  type RequestOptions,
} from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { track } from '@affine/track';
import { UnauthorizedError } from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import { getCurrentStore } from '@toeverything/infra';
import { z } from 'zod';

import type { PromptKey } from './prompt';
import {
  cleanupSessions,
  createChatSession,
  forkCopilotSession,
  listHistories,
  textToText,
  toImage,
} from './request';
import { setupTracker } from './tracker';

const filterStyleToPromptName = new Map(
  Object.entries({
    'Clay style': 'workflow:image-clay',
    'Pixel style': 'workflow:image-pixel',
    'Sketch style': 'workflow:image-sketch',
    'Anime style': 'workflow:image-anime',
  })
);

const processTypeToPromptName = new Map(
  Object.entries({
    Clearer: 'debug:action:fal-upscaler',
    'Remove background': 'debug:action:fal-remove-bg',
    'Convert to sticker': 'debug:action:fal-face-to-sticker',
  })
);

export function setupAIProvider() {
  // a single workspace should have only a single chat session
  // user-id:workspace-id:doc-id -> chat session id
  const chatSessions = new Map<string, Promise<string>>();

  async function getChatSessionId(workspaceId: string, docId: string) {
    const userId = (await AIProvider.userInfo)?.id;

    if (!userId) {
      throw new UnauthorizedError();
    }

    const storeKey = `${userId}:${workspaceId}:${docId}`;
    if (!chatSessions.has(storeKey)) {
      chatSessions.set(
        storeKey,
        createChatSession({
          workspaceId,
          docId,
        })
      );
    }
    try {
      const sessionId = await chatSessions.get(storeKey);
      assertExists(sessionId);
      return sessionId;
    } catch (err) {
      // do not cache the error
      chatSessions.delete(storeKey);
      throw err;
    }
  }

  //#region actions
  AIProvider.provide('chat', options => {
    const sessionId =
      options.sessionId ?? getChatSessionId(options.workspaceId, options.docId);
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
      params: {
        tone: options.tone.toLowerCase(),
      },
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
      promptName: 'workflow:brainstorm',
      workflow: true,
    });
  });

  AIProvider.provide('expandMindmap', options => {
    assertExists(options.input, 'expandMindmap action requires input');
    return textToText({
      ...options,
      params: {
        mindmap: options.mindmap,
        node: options.input,
      },
      content: options.input,
      promptName: 'Expand mind map',
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
    let promptName: PromptKey = 'Make it real';
    let content = options.content || '';

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

    return textToText({
      ...options,
      content,
      promptName,
    });
  });

  AIProvider.provide('createSlides', options => {
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
    return textToText({
      ...options,
      content: options.input,
      promptName: 'workflow:presentation',
      workflow: true,
      postfix,
    });
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
    });
  });

  AIProvider.provide('filterImage', options => {
    // test to image
    const promptName = filterStyleToPromptName.get(options.style as string);
    return toImage({
      ...options,
      timeout: 120000,
      promptName: promptName as PromptKey,
      workflow: !!promptName?.startsWith('workflow:'),
    });
  });

  AIProvider.provide('processImage', options => {
    // test to image
    const promptName = processTypeToPromptName.get(
      options.type as string
    ) as PromptKey;
    return toImage({
      ...options,
      timeout: 120000,
      promptName,
    });
  });

  AIProvider.provide('generateCaption', options => {
    return textToText({
      ...options,
      content: options.input,
      promptName: 'Generate a caption',
    });
  });

  AIProvider.provide('continueWriting', options => {
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
      docId?: string,
      options?: RequestOptions<
        typeof getCopilotHistoriesQuery
      >['variables']['options']
    ): Promise<BlockSuitePresets.AIHistory[]> => {
      // @ts-expect-error - 'action' is missing in server impl
      return (await listHistories(workspaceId, docId, options)) ?? [];
    },
    cleanup: async (
      workspaceId: string,
      docId: string,
      sessionIds: string[]
    ) => {
      await cleanupSessions({ workspaceId, docId, sessionIds });
    },
    ids: async (
      workspaceId: string,
      docId?: string,
      options?: RequestOptions<
        typeof getCopilotHistoriesQuery
      >['variables']['options']
    ): Promise<BlockSuitePresets.AIHistoryIds[]> => {
      // @ts-expect-error - 'role' is missing type in server impl
      return await listHistories(workspaceId, docId, options);
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

  AIProvider.provide('onboarding', toggleGeneralAIOnboarding);

  AIProvider.provide('forkChat', options => {
    return forkCopilotSession(options);
  });

  AIProvider.slots.requestUpgradePlan.on(() => {
    getCurrentStore().set(openSettingModalAtom, {
      activeTab: 'billing',
      open: true,
    });
    track.$.paywall.aiAction.viewPlans();
  });

  AIProvider.slots.requestLogin.on(() => {
    getCurrentStore().set(authAtom, s => ({
      ...s,
      openModal: true,
    }));
  });

  AIProvider.slots.requestRunInEdgeless.on(() => {
    notify.warning({
      title: (
        <Trans i18nKey="com.affine.ai.action.edgeless-only.dialog-title" />
      ),
    });
  });

  setupTracker();
}
