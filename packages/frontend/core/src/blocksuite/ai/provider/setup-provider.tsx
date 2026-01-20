import { toggleGeneralAIOnboarding } from '@affine/core/components/affine/ai-onboarding/apis';
import type { AuthAccountInfo, AuthService } from '@affine/core/modules/cloud';
import type { GlobalDialogService } from '@affine/core/modules/dialogs';
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

import { AIProvider } from './ai-provider';
import { type CopilotClient, Endpoint } from './copilot-client';
import type { PromptKey } from './prompt';
import { textToText, toImage } from './request';
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
  authService: AuthService
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

  AIProvider.provide('summary', async options => {
    const sessionId = await createSession({
      promptName: 'Summary',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('translate', async options => {
    const sessionId = await createSession({
      promptName: 'Translate to',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
      params: {
        language: options.lang,
      },
    });
  });

  AIProvider.provide('changeTone', async options => {
    const sessionId = await createSession({
      promptName: 'Change tone to',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      params: {
        tone: options.tone.toLowerCase(),
      },
      content: options.input,
    });
  });

  AIProvider.provide('improveWriting', async options => {
    const sessionId = await createSession({
      promptName: 'Improve writing for it',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('improveGrammar', async options => {
    const sessionId = await createSession({
      promptName: 'Improve grammar for it',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('fixSpelling', async options => {
    const sessionId = await createSession({
      promptName: 'Fix spelling for it',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

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

  AIProvider.provide('makeLonger', async options => {
    const sessionId = await createSession({
      promptName: 'Make it longer',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('makeShorter', async options => {
    const sessionId = await createSession({
      promptName: 'Make it shorter',
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

  AIProvider.provide('explain', async options => {
    const sessionId = await createSession({
      promptName: 'Explain this',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
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

  AIProvider.provide('continueWriting', async options => {
    const sessionId = await createSession({
      promptName: 'Continue writing',
      ...options,
    });
    return textToText({
      ...options,
      client,
      sessionId,
      content: options.input,
    });
  });
  //#endregion

  AIProvider.provide('session', {
    createSession,
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
      } = await client.fetcher(url.toString()).then(res => res.json());
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
