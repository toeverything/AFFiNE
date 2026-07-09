import type { NbstoreService } from '@affine/core/modules/storage';
import { apis } from '@affine/electron-api';
import {
  ByokKeyStorage,
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

import {
  capabilitiesFor,
  inferProviderFromModel,
} from '../../../../modules/ai-button/services/catalog';
import type { ActionEventType } from '../../provider';
import { GeneralNetworkError } from '../../provider/error';
import {
  type AIActionId,
  type AIActionOptions,
  getActionDefinition,
  resolveDefinitionValue,
} from './action-definitions';
import { getAIModelService, hasAIModelService } from './ai-model-provider';
import {
  CopilotClient,
  type CopilotClient as CopilotClientType,
  Endpoint,
} from './copilot-client';
import { enrichDesktopChatActionOptions } from './desktop-chat-options';
import { resolveDesktopChatLane } from './desktop-route-policy';
import {
  textToText,
  type TextToTextOptions,
  toImage,
} from './message-transport';

type CreateSessionOptions = BlockSuitePresets.AICreateSessionOptions;

export type AIRequestActionEvent = {
  action: AIActionId;
  options: AIActionOptions;
  event: ActionEventType;
};

function supportsServerActionModel(modelId?: string) {
  if (!modelId) {
    return true;
  }

  const provider = inferProviderFromModel(modelId);
  if (!provider) {
    return true;
  }

  return capabilitiesFor(provider, ByokKeyStorage.server).includes('Actions');
}

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

  private async resolveChatTransport(
    id: AIActionId,
    options: AIActionOptions
  ): Promise<
    Pick<Parameters<typeof textToText>[0], 'executionLane' | 'localCapable'>
  > {
    const requestedModelId =
      typeof options.modelId === 'string' ? options.modelId : undefined;
    const shouldPreserveExplicitLocalLane =
      options.executionLane === 'local' &&
      (id === 'chat' || getActionDefinition(id).responseType === 'text');

    if (options.executionLane === 'server') {
      return {};
    }

    if (options.executionLane === 'local') {
      try {
        const localStatus = (await apis?.localAI?.ensureReady?.()) ?? null;
        const decision = await resolveDesktopChatLane({
          requestAction: id,
          modelId: requestedModelId,
          retry: options.retry,
          localStatus,
        });

        if (decision.lane === 'local') {
          return { executionLane: 'local', localCapable: true };
        }

        return shouldPreserveExplicitLocalLane
          ? { executionLane: 'local' }
          : { executionLane: 'server' };
      } catch (error) {
        console.warn(
          shouldPreserveExplicitLocalLane
            ? 'Desktop local AI status probe failed, keeping local execution lane'
            : 'Desktop local AI status probe failed, falling back to server',
          error
        );
        return shouldPreserveExplicitLocalLane
          ? { executionLane: 'local' }
          : { executionLane: 'server' };
      }
    }

    if (id !== 'chat') {
      return {};
    }

    const initialDecision = await resolveDesktopChatLane({
      requestAction: id,
      modelId: requestedModelId,
      retry: options.retry,
      localStatus: null,
    });

    if (initialDecision.reason !== 'local_runtime_unavailable') {
      return initialDecision.lane === 'local'
        ? { executionLane: 'local', localCapable: true }
        : {};
    }

    try {
      const localStatus = (await apis?.localAI?.getStatus?.()) ?? null;
      const finalDecision = await resolveDesktopChatLane({
        requestAction: id,
        modelId: requestedModelId,
        retry: options.retry,
        localStatus,
      });

      return finalDecision.lane === 'local'
        ? { executionLane: 'local', localCapable: true }
        : {};
    } catch (error) {
      console.warn(
        'Desktop local AI status probe failed, falling back to server',
        error
      );
      return {};
    }
  }

  private createLocalChatStreamWithServerFallback(
    localTransportOptions: Parameters<typeof textToText>[0],
    buildServerTransportOptions: () => Promise<
      Parameters<typeof textToText>[0]
    >,
    signal?: AbortSignal,
    allowServerFallback = true
  ): AsyncIterable<string> {
    return {
      async *[Symbol.asyncIterator]() {
        let yieldedChunk = false;

        try {
          const localStream = textToText(
            localTransportOptions
          ) as AsyncIterable<string>;
          for await (const chunk of localStream) {
            yieldedChunk = true;
            yield chunk;
          }
          return;
        } catch (error) {
          if (yieldedChunk || signal?.aborted || !allowServerFallback) {
            throw error;
          }

          console.warn(
            'Desktop local AI request failed, falling back to server',
            error
          );
        }

        const serverTransportOptions = await buildServerTransportOptions();
        yield* textToText(serverTransportOptions) as AsyncIterable<string>;
      },
    };
  }

  private shouldBlockUnsupportedLocalImageAction(options: AIActionOptions) {
    if (!apis?.localAI || !hasAIModelService()) {
      return false;
    }

    const modelService = getAIModelService();
    const activeModelId = modelService.getActiveModelId(
      (options.modelId as string | undefined) ?? modelService.modelId.value
    );

    if (!activeModelId) {
      return false;
    }

    return modelService.getExecutionPreference(activeModelId) === 'local';
  }

  async executeAction(id: AIActionId, options: AIActionOptions) {
    options = enrichDesktopChatActionOptions(options, id) as AIActionOptions;
    this.actionHistory.push({ action: id, options });
    if (this.actionHistory.length > 10) {
      this.actionHistory.shift();
    }
    this.actionEvents$.next({ action: id, options, event: 'started' });
    const definition = getActionDefinition(id);
    definition.validate?.(options);

    if (
      definition.responseType === 'image' &&
      this.shouldBlockUnsupportedLocalImageAction(options)
    ) {
      throw new GeneralNetworkError(
        'This action is not supported by Local Gemma yet. Please log in to AFFiNE Cloud and switch Chat preference from Local to Cloud to continue.'
      );
    }

    const promptName = resolveDefinitionValue(
      definition.promptName,
      options
    ) as CreateSessionOptions['promptName'];
    const requestedModelId =
      typeof options.modelId === 'string' ? options.modelId : undefined;
    const requestedSessionId =
      typeof options.sessionId === 'string' ? options.sessionId : undefined;
    const requestedExecutionLane =
      options.executionLane === 'local' || options.executionLane === 'server'
        ? options.executionLane
        : undefined;
    const actionId = resolveDefinitionValue(definition.actionId, options);
    const actionVersion = resolveDefinitionValue(
      definition.actionVersion,
      options
    );
    const chatTransport =
      definition.responseType === 'text'
        ? await this.resolveChatTransport(id, options)
        : {};
    const resolvedExecutionLane: TextToTextOptions['executionLane'] =
      chatTransport.executionLane ??
      (id === 'chat' && requestedExecutionLane === 'local'
        ? 'server'
        : requestedExecutionLane);

    const transportModelId =
      resolvedExecutionLane === 'server' &&
      definition.endpoint === Endpoint.Action &&
      !supportsServerActionModel(requestedModelId)
        ? undefined
        : requestedModelId;

    let sessionId = requestedSessionId;
    if (resolvedExecutionLane !== 'local') {
      sessionId = await this.createSession({
        promptName,
        ...options,
      } as CreateSessionOptions);
      this.lastActionSessionId = sessionId;
    }

    const {
      executionLane: _requestedExecutionLane,
      modelId: _requestedModelId,
      sessionId: _requestedSessionId,
      ...baseTransportOptions
    } = options;
    const transportOptions: TextToTextOptions = {
      ...(baseTransportOptions as Partial<TextToTextOptions>),
      modelId: transportModelId,
      client: this.client,
      sessionId,
      content: definition.buildContent?.(options) ?? options.input,
      params: definition.buildParams?.(options),
      timeout: definition.timeout,
      endpoint: definition.endpoint,
      actionId,
      actionVersion,
      promptName,
      executionLane: resolvedExecutionLane,
      localCapable: chatTransport.localCapable,
    };

    if (
      definition.responseType === 'text' &&
      resolvedExecutionLane === 'local'
    ) {
      const localStream = this.createLocalChatStreamWithServerFallback(
        transportOptions,
        async () => {
          const fallbackSessionId = await this.createSession({
            promptName,
            ...options,
            executionLane: 'server',
          } as CreateSessionOptions);
          this.lastActionSessionId = fallbackSessionId;

          const fallbackModelId =
            definition.endpoint === Endpoint.Action &&
            !supportsServerActionModel(requestedModelId)
              ? undefined
              : requestedModelId;

          return {
            ...transportOptions,
            sessionId: fallbackSessionId,
            executionLane: 'server' as const,
            localCapable: undefined,
            modelId: fallbackModelId,
          };
        },
        options.signal,
        requestedExecutionLane !== 'local'
      );

      return this.wrapTextStream(localStream, id, options);
    }

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
