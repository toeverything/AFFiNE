import type { NbstoreService } from '@affine/core/modules/storage';
import {
  ContextCategories,
  type CopilotChatHistoryFragment,
  type getCopilotHistoriesQuery,
  type GraphQLQuery,
  type QueryChatSessionsInput,
  type QueryOptions,
  type QueryResponse,
  type RequestOptions,
  type UpdateChatSessionInput,
} from '@affine/graphql';
import { Subject } from 'rxjs';

import type { ActionEventType } from '../../provider';
import {
  type AIActionId,
  type AIActionOptions,
  getActionDefinition,
  resolveDefinitionValue,
} from './action-definitions';
import {
  CopilotClient,
  type CopilotClient as CopilotClientType,
} from './copilot-client';
import { textToText, toImage } from './message-transport';

type CreateSessionOptions = BlockSuitePresets.AICreateSessionOptions;

export type AIRequestActionEvent = {
  action: AIActionId;
  options: AIActionOptions;
  event: ActionEventType;
};

export class AIRequestService {
  private lastActionSessionId = '';
  private readonly actionHistory: {
    action: AIActionId;
    options: AIActionOptions;
  }[] = [];
  readonly actionEvents$ = new Subject<AIRequestActionEvent>();

  constructor(readonly client: CopilotClientType) {}

  isReady() {
    return true;
  }

  async createSession(options: CreateSessionOptions) {
    if (options.sessionId) return options.sessionId;
    if (options.retry) return this.lastActionSessionId;
    return this.client.createSession({
      workspaceId: options.workspaceId,
      docId: options.docId,
      promptName: options.promptName,
      pinned: options.pinned,
      reuseLatestChat: options.reuseLatestChat,
    });
  }

  async createSessionWithHistory(options: CreateSessionOptions) {
    if (!options.sessionId && !options.retry) {
      return this.client.createSessionWithHistory({
        workspaceId: options.workspaceId,
        docId: options.docId,
        promptName: options.promptName,
        pinned: options.pinned,
        reuseLatestChat: options.reuseLatestChat,
      });
    }

    const sessionId = await this.createSession(options);
    if (!sessionId) return undefined;
    return this.getSession(options.workspaceId, sessionId);
  }

  getSession(workspaceId: string, sessionId: string) {
    return this.client
      .getHistories(workspaceId, {}, undefined, {
        sessionId,
        withMessages: true,
      } as RequestOptions<
        typeof getCopilotHistoriesQuery
      >['variables']['options'])
      .then(
        histories =>
          (histories?.[0] ?? null) as CopilotChatHistoryFragment | null
      );
  }

  getSessions(
    workspaceId: string,
    docId?: string,
    options?: QueryChatSessionsInput,
    signal?: AbortSignal
  ) {
    return this.client.getSessions(
      workspaceId,
      {},
      docId,
      { ...options, withMessages: true },
      signal
    );
  }

  getRecentSessions(workspaceId: string, limit?: number, offset?: number) {
    return this.client.getHistories(
      workspaceId,
      { first: limit, offset },
      undefined,
      {
        action: false,
        fork: false,
        sessionOrder: 'desc',
        withMessages: true,
      } as RequestOptions<
        typeof getCopilotHistoriesQuery
      >['variables']['options']
    );
  }

  updateSession(options: UpdateChatSessionInput) {
    return this.client.updateSession(options);
  }

  cleanupSessions(input: {
    workspaceId: string;
    docId: string | undefined;
    sessionIds: string[];
  }) {
    return this.client.cleanupSessions(input);
  }

  histories = {
    actions: async (
      workspaceId: string,
      docId: string
    ): Promise<BlockSuitePresets.AIHistory[]> => {
      return ((await this.client.getHistories(workspaceId, {}, docId, {
        action: true,
        withPrompt: true,
        withMessages: true,
      } as RequestOptions<
        typeof getCopilotHistoriesQuery
      >['variables']['options'])) ?? []) as BlockSuitePresets.AIHistory[];
    },
    chats: async (
      workspaceId: string,
      sessionId: string,
      docId?: string
    ): Promise<BlockSuitePresets.AIHistory[]> => {
      return ((await this.client.getHistories(workspaceId, {}, docId, {
        sessionId,
        withMessages: true,
      } as RequestOptions<
        typeof getCopilotHistoriesQuery
      >['variables']['options'])) ?? []) as BlockSuitePresets.AIHistory[];
    },
    cleanup: async (
      workspaceId: string,
      docId: string | undefined,
      sessionIds: string[]
    ) => {
      await this.cleanupSessions({ workspaceId, docId, sessionIds });
    },
    ids: async (
      workspaceId: string,
      docId?: string,
      options?: RequestOptions<
        typeof getCopilotHistoriesQuery
      >['variables']['options']
    ): Promise<BlockSuitePresets.AIHistoryIds[]> => {
      return (await this.client.getHistoryIds(
        workspaceId,
        {},
        docId,
        options
      )) as unknown as BlockSuitePresets.AIHistoryIds[];
    },
  };

  context = {
    createContext: (workspaceId: string, sessionId: string) =>
      this.client.createContext(workspaceId, sessionId),
    getContextId: (workspaceId: string, sessionId: string) =>
      this.client.getContextId(workspaceId, sessionId),
    addContextDoc: (options: { contextId: string; docId: string }) =>
      this.client.addContextDoc(options),
    removeContextDoc: (options: { contextId: string; docId: string }) =>
      this.client.removeContextDoc(options),
    addContextFile: (
      file: File,
      options: Parameters<CopilotClient['addContextFile']>[1]
    ) => this.client.addContextFile(file, options),
    removeContextFile: (options: { contextId: string; fileId: string }) =>
      this.client.removeContextFile(options),
    addContextTag: (options: {
      contextId: string;
      tagId: string;
      docIds: string[];
    }) =>
      this.client.addContextCategory({
        contextId: options.contextId,
        type: ContextCategories.Tag,
        categoryId: options.tagId,
        docs: options.docIds,
      }),
    removeContextTag: (options: { contextId: string; tagId: string }) =>
      this.client.removeContextCategory({
        contextId: options.contextId,
        type: ContextCategories.Tag,
        categoryId: options.tagId,
      }),
    addContextCollection: (options: {
      contextId: string;
      collectionId: string;
      docIds: string[];
    }) =>
      this.client.addContextCategory({
        contextId: options.contextId,
        type: ContextCategories.Collection,
        categoryId: options.collectionId,
        docs: options.docIds,
      }),
    removeContextCollection: (options: {
      contextId: string;
      collectionId: string;
    }) =>
      this.client.removeContextCategory({
        contextId: options.contextId,
        type: ContextCategories.Collection,
        categoryId: options.collectionId,
      }),
    getContextDocsAndFiles: (
      workspaceId: string,
      sessionId: string,
      contextId: string
    ) => this.client.getContextDocsAndFiles(workspaceId, sessionId, contextId),
    matchContext: (
      content: string,
      contextId?: string,
      workspaceId?: string,
      limit?: number,
      scopedThreshold?: number,
      threshold?: number
    ) =>
      this.client.matchContext(
        content,
        contextId,
        workspaceId,
        limit,
        scopedThreshold,
        threshold
      ),
    addContextBlob: (options: { blobId: string; contextId: string }) =>
      this.client.addContextBlob({
        contextId: options.contextId,
        blobId: options.blobId,
      }),
    removeContextBlob: (options: { blobId: string; contextId: string }) =>
      this.client.removeContextBlob({
        contextId: options.contextId,
        blobId: options.blobId,
      }),
    pollContextDocsAndFiles: async (
      workspaceId: string,
      sessionId: string,
      contextId: string,
      onPoll: (
        result: BlockSuitePresets.AIDocsAndFilesContext | undefined
      ) => void,
      abortSignal: AbortSignal
    ) => {
      let attempts = 0;
      const minInterval = 1000;
      const maxInterval = 30 * 1000;

      while (!abortSignal.aborted) {
        const result = await this.client.getContextDocsAndFiles(
          workspaceId,
          sessionId,
          contextId
        );
        onPoll(result);
        const interval = Math.min(
          minInterval * Math.pow(1.5, attempts),
          maxInterval
        );
        attempts++;
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    },
    pollEmbeddingStatus: async (
      workspaceId: string,
      onPoll: (
        result: Awaited<ReturnType<CopilotClientType['getEmbeddingStatus']>>
      ) => void,
      abortSignal: AbortSignal
    ) => {
      const interval = 10 * 1000;
      while (!abortSignal.aborted) {
        onPoll(await this.client.getEmbeddingStatus(workspaceId));
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    },
  };

  forkChat(options: BlockSuitePresets.AIForkChatSessionOptions) {
    return this.client.forkSession(options);
  }

  reportLastAction(event: ActionEventType, host?: unknown) {
    const lastAction = host
      ? this.actionHistory.findLast(item => item.options.host === host)
      : this.actionHistory.at(-1);
    if (!lastAction) return;
    this.actionEvents$.next({
      action: lastAction.action,
      options: lastAction.options,
      event,
    });
  }

  private wrapTextStream(
    stream: AsyncIterable<string>,
    id: AIActionId,
    options: AIActionOptions
  ): AsyncIterable<string> {
    const actionEvents$ = this.actionEvents$;
    return {
      async *[Symbol.asyncIterator]() {
        try {
          yield* stream;
          actionEvents$.next({ action: id, options, event: 'finished' });
        } catch (error) {
          actionEvents$.next({ action: id, options, event: 'error' });
          throw error;
        }
      },
    };
  }

  async executeAction(id: AIActionId, options: AIActionOptions) {
    this.actionHistory.push({ action: id, options });
    if (this.actionHistory.length > 10) {
      this.actionHistory.shift();
    }
    this.actionEvents$.next({ action: id, options, event: 'started' });
    const definition = getActionDefinition(id);
    definition.validate?.(options);
    const promptName = resolveDefinitionValue(
      definition.promptName,
      options
    ) as CreateSessionOptions['promptName'];
    const sessionId = await this.createSession({
      promptName,
      ...options,
    } as CreateSessionOptions);
    this.lastActionSessionId = sessionId;

    const actionId = resolveDefinitionValue(definition.actionId, options);
    const actionVersion = resolveDefinitionValue(
      definition.actionVersion,
      options
    );
    const transportOptions = {
      ...options,
      client: this.client,
      sessionId,
      content: definition.buildContent?.(options) ?? options.input,
      params: definition.buildParams?.(options),
      timeout: definition.timeout,
      endpoint: definition.endpoint,
      actionId,
      actionVersion,
    };

    const stream =
      definition.responseType === 'image'
        ? toImage(transportOptions)
        : textToText(transportOptions);
    return this.wrapTextStream(stream as AsyncIterable<string>, id, options);
  }
}

export function createAIRequestService(
  gql: <Query extends GraphQLQuery>(
    options: QueryOptions<Query>
  ) => Promise<QueryResponse<Query>>,
  eventSource: (
    url: string,
    eventSourceInitDict?: EventSourceInit
  ) => EventSource,
  realtime: Pick<NbstoreService['realtime'], 'request'>
) {
  return new AIRequestService(new CopilotClient(gql, eventSource, realtime));
}
