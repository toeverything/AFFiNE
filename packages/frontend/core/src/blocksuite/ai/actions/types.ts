import type {
  ChatHistoryOrder,
  ContextMatchedDocChunk,
  ContextMatchedFileChunk,
  CopilotContextCategory,
  CopilotContextDoc,
  CopilotContextFile,
  CopilotSessionType,
  getCopilotHistoriesQuery,
  RequestOptions,
} from '@affine/graphql';
import type { EditorHost } from '@blocksuite/affine/block-std';
import type { GfxModel } from '@blocksuite/affine/block-std/gfx';
import type { BlockModel } from '@blocksuite/affine/store';

import type { DocContext, FileContext } from '../chat-panel/chat-context';

export const translateLangs = [
  'English',
  'Spanish',
  'German',
  'French',
  'Italian',
  'Simplified Chinese',
  'Traditional Chinese',
  'Japanese',
  'Russian',
  'Korean',
] as const;

export const textTones = [
  'Professional',
  'Informal',
  'Friendly',
  'Critical',
  'Humorous',
] as const;

export const imageFilterStyles = [
  'Clay style',
  'Sketch style',
  'Anime style',
  'Pixel style',
] as const;

export const imageProcessingTypes = [
  'Clearer',
  'Remove background',
  'Convert to sticker',
] as const;

declare global {
  // oxlint-disable-next-line @typescript-eslint/no-namespace
  namespace BlockSuitePresets {
    type TrackerControl =
      | 'format-bar'
      | 'slash-menu'
      | 'chat-send'
      | 'block-action-bar';

    type TrackerWhere =
      | 'chat-panel'
      | 'inline-chat-panel'
      | 'ai-panel'
      | 'ai-chat-block';

    interface TrackerOptions {
      control: TrackerControl;
      where: TrackerWhere;
    }

    interface AITextActionOptions {
      // user input text
      input?: string;
      stream?: boolean;
      attachments?: (string | File | Blob)[]; // blob could only be strings for the moments (url or data urls)
      signal?: AbortSignal;
      retry?: boolean;

      // action's context
      docId: string;
      workspaceId: string;

      // internal context
      host: EditorHost;
      models?: (BlockModel | GfxModel)[];
      control: TrackerControl;
      where: TrackerWhere;
    }

    interface AIForkChatSessionOptions {
      docId: string;
      workspaceId: string;
      sessionId: string;
      latestMessageId: string;
    }

    interface AIImageActionOptions extends AITextActionOptions {
      seed?: string;
    }

    interface FilterImageOptions extends AIImageActionOptions {
      style: (typeof imageFilterStyles)[number];
    }

    interface ProcessImageOptions extends AIImageActionOptions {
      type: (typeof imageProcessingTypes)[number];
    }

    type TextStream = {
      [Symbol.asyncIterator](): AsyncIterableIterator<string>;
    };

    type AIActionTextResponse<T extends AITextActionOptions> =
      T['stream'] extends true ? TextStream : Promise<string>;

    interface ChatOptions extends AITextActionOptions {
      sessionId?: string;
      isRootSession?: boolean;
      contexts?: {
        docs: DocContext[];
        files: FileContext[];
      };
    }

    interface TranslateOptions extends AITextActionOptions {
      lang: (typeof translateLangs)[number];
    }

    interface ChangeToneOptions extends AITextActionOptions {
      tone: (typeof textTones)[number];
    }

    interface ExpandMindMap extends AITextActionOptions {
      mindmap: string;
    }

    interface BrainstormMindMap extends AITextActionOptions {
      regenerate?: boolean;
    }

    interface AIActions {
      // chat is a bit special because it's has a internally maintained session
      chat<T extends ChatOptions>(options: T): AIActionTextResponse<T>;

      summary<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      improveWriting<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      improveGrammar<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      fixSpelling<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      createHeadings<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      makeLonger<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      makeShorter<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      continueWriting<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      checkCodeErrors<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      explainCode<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      writeArticle<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      writeTwitterPost<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      writePoem<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      writeBlogPost<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      brainstorm<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      writeOutline<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;

      explainImage<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;

      findActions<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;

      // mindmap
      brainstormMindmap<T extends BrainstormMindMap>(
        options: T
      ): AIActionTextResponse<T>;
      expandMindmap<T extends ExpandMindMap>(
        options: T
      ): AIActionTextResponse<T>;

      // presentation
      createSlides<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;

      // explain this
      explain<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;

      // actions with variants
      translate<T extends TranslateOptions>(
        options: T
      ): AIActionTextResponse<T>;
      changeTone<T extends ChangeToneOptions>(
        options: T
      ): AIActionTextResponse<T>;

      // make it real, image to text
      makeItReal<T extends AIImageActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      createImage<T extends AIImageActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
      processImage<T extends ProcessImageOptions>(
        options: T
      ): AIActionTextResponse<T>;
      filterImage<T extends FilterImageOptions>(
        options: T
      ): AIActionTextResponse<T>;
      generateCaption<T extends AITextActionOptions>(
        options: T
      ): AIActionTextResponse<T>;
    }

    type AIDocsAndFilesContext = {
      docs: CopilotContextDoc[];
      files: CopilotContextFile[];
      tags: CopilotContextCategory[];
      collections: CopilotContextCategory[];
    };

    interface AIContextService {
      createContext: (
        workspaceId: string,
        sessionId: string
      ) => Promise<string>;
      getContextId: (
        workspaceId: string,
        sessionId: string
      ) => Promise<string | undefined>;
      addContextDoc: (options: {
        contextId: string;
        docId: string;
      }) => Promise<CopilotContextDoc>;
      removeContextDoc: (options: {
        contextId: string;
        docId: string;
      }) => Promise<boolean>;
      addContextFile: (
        file: File,
        options: {
          contextId: string;
          blobId: string;
        }
      ) => Promise<CopilotContextFile>;
      removeContextFile: (options: {
        contextId: string;
        fileId: string;
      }) => Promise<boolean>;
      addContextTag: (options: {
        contextId: string;
        tagId: string;
        docIds: string[];
      }) => Promise<CopilotContextCategory>;
      removeContextTag: (options: {
        contextId: string;
        tagId: string;
      }) => Promise<boolean>;
      addContextCollection: (options: {
        contextId: string;
        collectionId: string;
        docIds: string[];
      }) => Promise<CopilotContextCategory>;
      removeContextCollection: (options: {
        contextId: string;
        collectionId: string;
      }) => Promise<boolean>;
      getContextDocsAndFiles: (
        workspaceId: string,
        sessionId: string,
        contextId: string
      ) => Promise<AIDocsAndFilesContext | undefined>;
      pollContextDocsAndFiles: (
        workspaceId: string,
        sessionId: string,
        contextId: string,
        onPoll: (result: AIDocsAndFilesContext | undefined) => void,
        abortSignal: AbortSignal
      ) => Promise<void>;
      matchContext: (
        contextId: string,
        content: string,
        limit?: number
      ) => Promise<{
        files?: ContextMatchedFileChunk[];
        docs?: ContextMatchedDocChunk[];
      }>;
    }

    // TODO(@Peng): should be refactored to get rid of implement details (like messages, action, role, etc.)
    interface AIHistory {
      sessionId: string;
      tokens: number;
      action: string;
      createdAt: string;
      messages: {
        id: string; // message id
        content: string;
        createdAt: string;
        role: MessageRole;
        attachments?: string[];
      }[];
    }

    type MessageRole = 'user' | 'assistant';

    type AIHistoryIds = Pick<AIHistory, 'sessionId' | 'messages'> & {
      messages: Pick<
        AIHistory['messages'][number],
        'id' | 'createdAt' | 'role'
      >[];
    };

    interface AISessionService {
      createSession: (
        workspaceId: string,
        docId: string,
        promptName?: string
      ) => Promise<string>;
      getSessions: (
        workspaceId: string,
        docId?: string,
        options?: { action?: boolean }
      ) => Promise<CopilotSessionType[] | undefined>;
      updateSession: (sessionId: string, promptName: string) => Promise<string>;
    }

    interface AIHistoryService {
      // non chat histories
      actions: (
        workspaceId: string,
        docId?: string
      ) => Promise<AIHistory[] | undefined>;
      chats: (
        workspaceId: string,
        docId?: string,
        options?: {
          sessionId?: string;
          messageOrder?: ChatHistoryOrder;
        }
      ) => Promise<AIHistory[] | undefined>;
      cleanup: (
        workspaceId: string,
        docId: string,
        sessionIds: string[]
      ) => Promise<void>;
      ids: (
        workspaceId: string,
        docId?: string,
        options?: RequestOptions<
          typeof getCopilotHistoriesQuery
        >['variables']['options']
      ) => Promise<AIHistoryIds[] | undefined>;
    }

    interface AIPhotoEngineService {
      searchImages(options: {
        width: number;
        height: number;
        query: string;
      }): Promise<string[]>;
    }
  }
}
