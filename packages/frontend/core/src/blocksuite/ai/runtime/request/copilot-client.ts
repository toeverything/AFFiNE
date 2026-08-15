import { showAILoginRequiredAtom } from '@affine/core/components/affine/auth/ai-login-required';
import type { AIToolsConfig } from '@affine/core/modules/ai-button';
import type { NbstoreService } from '@affine/core/modules/storage';
import { UserFriendlyError } from '@affine/error';
import {
  cleanupCopilotSessionMutation,
  createCopilotMessageMutation,
  createCopilotSessionMutation,
  createCopilotSessionWithHistoryMutation,
  forkCopilotSessionMutation,
  getCopilotHistoriesQuery,
  getCopilotHistoryIdsQuery,
  getCopilotRecentSessionsQuery,
  getCopilotSessionQuery,
  getCopilotSessionsQuery,
  type GraphQLQuery,
  type PaginationInput,
  type QueryOptions,
  type QueryResponse,
  type RequestOptions,
  updateCopilotSessionMutation,
} from '@affine/graphql';
import { getCurrentStore } from '@toeverything/infra';

import {
  GeneralNetworkError,
  PaymentRequiredError,
  SelectedSourcesFailedError,
  SelectedSourcesLimitExceededError,
  SelectedSourcesProcessingError,
  SelectedSourcesUnavailableError,
  UnauthorizedError,
} from '../../provider/error';

export enum Endpoint {
  Action = 'action',
  StreamObject = 'stream-object',
  Images = 'images',
}

type OptionsField<T extends GraphQLQuery> =
  RequestOptions<T>['variables'] extends { options: infer U } ? U : never;

function toUserFriendlyError(err: any): UserFriendlyError {
  return err instanceof UserFriendlyError
    ? err
    : UserFriendlyError.fromAny(err);
}

function isAbortError(error: UserFriendlyError) {
  return (
    error.name === 'REQUEST_ABORTED' ||
    error.code === 'REQUEST_ABORTED' ||
    error.message?.toLowerCase().includes('aborted') === true
  );
}

function codeToError(error: UserFriendlyError) {
  if (error.name === 'COPILOT_SELECTED_SOURCES_PROCESSING') {
    return new SelectedSourcesProcessingError(error.message);
  }
  if (error.name === 'COPILOT_SELECTED_SOURCES_FAILED') {
    return new SelectedSourcesFailedError(error.message);
  }
  if (error.name === 'COPILOT_SELECTED_SOURCES_UNAVAILABLE') {
    return new SelectedSourcesUnavailableError(error.message);
  }
  if (error.name === 'COPILOT_SELECTED_SOURCES_LIMIT_EXCEEDED') {
    return new SelectedSourcesLimitExceededError(error.message);
  }
  switch (error.status) {
    case 401:
      return new UnauthorizedError();
    case 402:
      return new PaymentRequiredError();
    default:
      return new GeneralNetworkError(
        error.code
          ? `${error.code}: ${error.message}\nIdentify: ${error.name}`
          : error.message
      );
  }
}

export function resolveError(err: any) {
  return codeToError(toUserFriendlyError(err));
}

export function handleError(src: any) {
  const err = resolveError(src);
  if (err instanceof UnauthorizedError) {
    getCurrentStore().set(showAILoginRequiredAtom, true);
  }
  return err;
}

export class CopilotClient {
  constructor(
    readonly gql: <Query extends GraphQLQuery>(
      options: QueryOptions<Query>
    ) => Promise<QueryResponse<Query>>,
    readonly eventSource: (
      url: string,
      eventSourceInitDict?: EventSourceInit
    ) => EventSource,
    readonly realtime?: Pick<NbstoreService['realtime'], 'request'>
  ) {}

  async createSession(
    options: OptionsField<typeof createCopilotSessionMutation>
  ) {
    try {
      const res = await this.gql({
        query: createCopilotSessionMutation,
        variables: {
          options,
        },
      });
      return res.createCopilotSession;
    } catch (err) {
      throw resolveError(err);
    }
  }

  async createSessionWithHistory(
    options: OptionsField<typeof createCopilotSessionWithHistoryMutation>
  ) {
    try {
      const res = await this.gql({
        query: createCopilotSessionWithHistoryMutation,
        variables: { options },
      });
      return res.createCopilotSessionWithHistory;
    } catch (err) {
      throw resolveError(err);
    }
  }

  async updateSession(
    options: OptionsField<typeof updateCopilotSessionMutation>
  ) {
    try {
      const res = await this.gql({
        query: updateCopilotSessionMutation,
        variables: {
          options,
        },
      });
      return res.updateCopilotSession;
    } catch (err) {
      throw resolveError(err);
    }
  }

  async forkSession(options: OptionsField<typeof forkCopilotSessionMutation>) {
    try {
      const res = await this.gql({
        query: forkCopilotSessionMutation,
        variables: {
          options,
        },
      });
      return res.forkCopilotSession;
    } catch (err) {
      throw resolveError(err);
    }
  }

  async createMessage(
    options: OptionsField<typeof createCopilotMessageMutation>,
    requestOptions?: Pick<
      RequestOptions<typeof createCopilotMessageMutation>,
      'timeout' | 'signal'
    >
  ) {
    try {
      const res = await this.gql({
        query: createCopilotMessageMutation,
        variables: {
          options,
        },
        timeout: requestOptions?.timeout,
        signal: requestOptions?.signal,
      });
      return res.createCopilotMessage;
    } catch (err) {
      throw resolveError(err);
    }
  }

  async getSession(workspaceId: string, sessionId: string) {
    try {
      const res = await this.gql({
        query: getCopilotSessionQuery,
        variables: { sessionId, workspaceId },
      });
      return res.currentUser?.copilot?.chats?.edges?.[0]?.node;
    } catch (err) {
      throw resolveError(err);
    }
  }

  async getSessions(
    workspaceId: string,
    pagination: PaginationInput,
    docId?: string,
    options?: RequestOptions<
      typeof getCopilotSessionsQuery
    >['variables']['options'],
    signal?: AbortSignal
  ) {
    try {
      const res = await this.gql({
        query: getCopilotSessionsQuery,
        variables: {
          workspaceId,
          pagination,
          docId,
          options,
        },
        signal,
      });
      return res.currentUser?.copilot?.chats.edges.map(e => e.node);
    } catch (err) {
      const parsed = toUserFriendlyError(err);
      if (isAbortError(parsed)) {
        return [];
      }
      throw resolveError(parsed);
    }
  }

  async getRecentSessions(
    workspaceId: string,
    limit?: number,
    offset?: number
  ) {
    try {
      const res = await this.gql({
        query: getCopilotRecentSessionsQuery,
        variables: {
          workspaceId,
          limit,
          offset,
        },
      });
      return res.currentUser?.copilot?.chats.edges.map(e => e.node);
    } catch (err) {
      const parsed = toUserFriendlyError(err);
      if (isAbortError(parsed)) {
        return [];
      }
      throw resolveError(parsed);
    }
  }

  async getHistories(
    workspaceId: string,
    pagination: PaginationInput,
    docId?: string,
    options?: RequestOptions<
      typeof getCopilotHistoriesQuery
    >['variables']['options']
  ) {
    try {
      const res = await this.gql({
        query: getCopilotHistoriesQuery,
        variables: {
          workspaceId,
          pagination,
          docId,
          options,
        },
      });

      return res.currentUser?.copilot?.chats.edges.map(e => e.node);
    } catch (err) {
      const parsed = toUserFriendlyError(err);
      if (isAbortError(parsed)) {
        return [];
      }
      throw resolveError(parsed);
    }
  }

  async getHistoryIds(
    workspaceId: string,
    pagination: PaginationInput,
    docId?: string,
    options?: RequestOptions<
      typeof getCopilotHistoryIdsQuery
    >['variables']['options']
  ) {
    try {
      const res = await this.gql({
        query: getCopilotHistoryIdsQuery,
        variables: {
          workspaceId,
          pagination,
          docId,
          options,
        },
      });

      return res.currentUser?.copilot?.chats.edges.map(e => e.node);
    } catch (err) {
      const parsed = toUserFriendlyError(err);
      if (isAbortError(parsed)) {
        return [];
      }
      throw resolveError(parsed);
    }
  }

  async cleanupSessions(input: {
    workspaceId: string;
    docId: string | undefined;
    sessionIds: string[];
  }) {
    try {
      const res = await this.gql({
        query: cleanupCopilotSessionMutation,
        variables: {
          input,
        },
      });
      return res.cleanupCopilotSession;
    } catch (err) {
      throw resolveError(err);
    }
  }

  // Text or image to text
  chatTextStream(
    {
      sessionId,
      messageId,
      reasoning,
      profileId,
      modelId,
      routeTargetId,
      toolsConfig,
      actionId,
      actionVersion,
      runId,
      retry,
      byokLeaseId,
    }: {
      sessionId: string;
      messageId?: string;
      reasoning?: boolean;
      profileId?: string;
      modelId?: string;
      routeTargetId?: string;
      toolsConfig?: AIToolsConfig;
      actionId?: string;
      actionVersion?: string;
      runId?: string;
      retry?: boolean;
      byokLeaseId?: string;
    },
    endpoint = Endpoint.StreamObject
  ) {
    let url =
      endpoint === Endpoint.Action
        ? `/api/copilot/actions/${sessionId}/stream`
        : `/api/copilot/chat/${sessionId}/${endpoint}`;
    const queryString = this.paramsToQueryString({
      messageId,
      reasoning,
      profileId,
      modelId,
      routeTargetId,
      toolsConfig,
      actionId,
      actionVersion,
      runId,
      retry,
      byokLeaseId,
    });
    if (queryString) {
      url += `?${queryString}`;
    }
    return this.eventSource(url);
  }

  // Text or image to images
  imagesStream(
    sessionId: string,
    messageId?: string,
    seed?: string,
    endpoint = Endpoint.Images,
    byokLeaseId?: string
  ) {
    let url = `/api/copilot/chat/${sessionId}/${endpoint}`;
    const queryString = this.paramsToQueryString({
      messageId,
      seed,
      byokLeaseId,
    });
    if (queryString) {
      url += `?${queryString}`;
    }
    return this.eventSource(url);
  }

  paramsToQueryString(
    params: Record<string, string | boolean | undefined | Record<string, any>>
  ) {
    const queryString = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'boolean') {
        if (value) {
          queryString.append(key, 'true');
        }
      } else if (typeof value === 'string') {
        queryString.append(key, value);
      } else if (typeof value === 'object' && value !== null) {
        queryString.append(key, JSON.stringify(value));
      }
    });
    return queryString.toString();
  }

  async getEmbeddingStatus(workspaceId: string) {
    if (!this.realtime) {
      throw new Error('Realtime client is required');
    }
    return await this.realtime.request(
      'workspace.embedding.progress.get',
      { workspaceId },
      { timeoutMs: 10000 }
    );
  }
}
