import { showAILoginRequiredAtom } from '@affine/core/components/affine/auth/ai-login-required';
import type { UserFriendlyError } from '@affine/error';
import {
  addContextCategoryMutation,
  addContextDocMutation,
  addContextFileMutation,
  cleanupCopilotSessionMutation,
  createCopilotContextMutation,
  createCopilotMessageMutation,
  createCopilotSessionMutation,
  forkCopilotSessionMutation,
  getCopilotHistoriesQuery,
  getCopilotHistoryIdsQuery,
  getCopilotSessionQuery,
  getCopilotSessionsQuery,
  getWorkspaceEmbeddingStatusQuery,
  type GraphQLQuery,
  listContextObjectQuery,
  listContextQuery,
  matchContextQuery,
  type QueryOptions,
  type QueryResponse,
  removeContextCategoryMutation,
  removeContextDocMutation,
  removeContextFileMutation,
  type RequestOptions,
  updateCopilotSessionMutation,
} from '@affine/graphql';
import { getCurrentStore } from '@toeverything/infra';

import {
  GeneralNetworkError,
  PaymentRequiredError,
  UnauthorizedError,
} from './error';

type OptionsField<T extends GraphQLQuery> =
  RequestOptions<T>['variables'] extends { options: infer U } ? U : never;

function codeToError(error: UserFriendlyError) {
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
  return codeToError(err);
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
    readonly fetcher: (input: string, init?: RequestInit) => Promise<Response>,
    readonly eventSource: (
      url: string,
      eventSourceInitDict?: EventSourceInit
    ) => EventSource
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
    options: OptionsField<typeof createCopilotMessageMutation>
  ) {
    try {
      const res = await this.gql({
        query: createCopilotMessageMutation,
        variables: {
          options,
        },
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
      return res.currentUser?.copilot?.session;
    } catch (err) {
      throw resolveError(err);
    }
  }

  async getSessions(
    workspaceId: string,
    docId?: string,
    options?: RequestOptions<
      typeof getCopilotSessionsQuery
    >['variables']['options']
  ) {
    try {
      const res = await this.gql({
        query: getCopilotSessionsQuery,
        variables: {
          workspaceId,
          docId,
          options,
        },
      });
      return res.currentUser?.copilot?.sessions;
    } catch (err) {
      throw resolveError(err);
    }
  }

  async getHistories(
    workspaceId: string,
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
          docId,
          options,
        },
      });

      return res.currentUser?.copilot?.histories;
    } catch (err) {
      throw resolveError(err);
    }
  }

  async getHistoryIds(
    workspaceId: string,
    docId?: string,
    options?: RequestOptions<
      typeof getCopilotHistoriesQuery
    >['variables']['options']
  ) {
    try {
      const res = await this.gql({
        query: getCopilotHistoryIdsQuery,
        variables: {
          workspaceId,
          docId,
          options,
        },
      });

      return res.currentUser?.copilot?.histories;
    } catch (err) {
      throw resolveError(err);
    }
  }

  async cleanupSessions(input: {
    workspaceId: string;
    docId: string;
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

  async createContext(workspaceId: string, sessionId: string) {
    const res = await this.gql({
      query: createCopilotContextMutation,
      variables: {
        workspaceId,
        sessionId,
      },
    });
    return res.createCopilotContext;
  }

  async getContextId(workspaceId: string, sessionId: string) {
    const res = await this.gql({
      query: listContextQuery,
      variables: {
        workspaceId,
        sessionId,
      },
    });
    return res.currentUser?.copilot?.contexts?.[0]?.id || undefined;
  }

  async addContextDoc(options: OptionsField<typeof addContextDocMutation>) {
    const res = await this.gql({
      query: addContextDocMutation,
      variables: {
        options,
      },
    });
    return res.addContextDoc;
  }

  async removeContextDoc(
    options: OptionsField<typeof removeContextDocMutation>
  ) {
    const res = await this.gql({
      query: removeContextDocMutation,
      variables: {
        options,
      },
    });
    return res.removeContextDoc;
  }

  async addContextFile(
    content: File,
    options: OptionsField<typeof addContextFileMutation>
  ) {
    const res = await this.gql({
      query: addContextFileMutation,
      variables: {
        content,
        options,
      },
      timeout: 60000,
    });
    return res.addContextFile;
  }

  async removeContextFile(
    options: OptionsField<typeof removeContextFileMutation>
  ) {
    const res = await this.gql({
      query: removeContextFileMutation,
      variables: {
        options,
      },
    });
    return res.removeContextFile;
  }

  async addContextCategory(
    options: OptionsField<typeof addContextCategoryMutation>
  ) {
    const res = await this.gql({
      query: addContextCategoryMutation,
      variables: {
        options,
      },
    });
    return res.addContextCategory;
  }

  async removeContextCategory(
    options: OptionsField<typeof removeContextCategoryMutation>
  ) {
    const res = await this.gql({
      query: removeContextCategoryMutation,
      variables: {
        options,
      },
    });
    return res.removeContextCategory;
  }

  async getContextDocsAndFiles(
    workspaceId: string,
    sessionId: string,
    contextId: string
  ) {
    const res = await this.gql({
      query: listContextObjectQuery,
      variables: {
        workspaceId,
        sessionId,
        contextId,
      },
    });
    return res.currentUser?.copilot?.contexts?.[0];
  }

  async matchContext(
    content: string,
    contextId?: string,
    workspaceId?: string,
    limit?: number,
    scopedThreshold?: number,
    threshold?: number
  ) {
    const res = await this.gql({
      query: matchContextQuery,
      variables: {
        content,
        contextId,
        workspaceId,
        limit,
        scopedThreshold,
        threshold,
      },
    });
    const { matchFiles: files, matchWorkspaceDocs: docs } =
      res.currentUser?.copilot?.contexts?.[0] || {};
    return { files, docs };
  }

  async chatText({
    sessionId,
    messageId,
    reasoning,
    webSearch,
    modelId,
    signal,
  }: {
    sessionId: string;
    messageId?: string;
    reasoning?: boolean;
    webSearch?: boolean;
    modelId?: string;
    signal?: AbortSignal;
  }) {
    let url = `/api/copilot/chat/${sessionId}`;
    const queryString = this.paramsToQueryString({
      messageId,
      reasoning,
      webSearch,
      modelId,
    });
    if (queryString) {
      url += `?${queryString}`;
    }
    const response = await this.fetcher(url.toString(), { signal });
    return response.text();
  }

  // Text or image to text
  chatTextStream(
    {
      sessionId,
      messageId,
      reasoning,
      webSearch,
      modelId,
    }: {
      sessionId: string;
      messageId?: string;
      reasoning?: boolean;
      webSearch?: boolean;
      modelId?: string;
    },
    endpoint = 'stream'
  ) {
    let url = `/api/copilot/chat/${sessionId}/${endpoint}`;
    const queryString = this.paramsToQueryString({
      messageId,
      reasoning,
      webSearch,
      modelId,
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
    endpoint = 'images'
  ) {
    let url = `/api/copilot/chat/${sessionId}/${endpoint}`;
    const queryString = this.paramsToQueryString({
      messageId,
      seed,
    });
    if (queryString) {
      url += `?${queryString}`;
    }
    return this.eventSource(url);
  }

  paramsToQueryString(params: Record<string, string | boolean | undefined>) {
    const queryString = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'boolean') {
        if (value) {
          queryString.append(key, 'true');
        }
      } else if (typeof value === 'string') {
        queryString.append(key, value);
      }
    });
    return queryString.toString();
  }

  getEmbeddingStatus(workspaceId: string) {
    return this.gql({
      query: getWorkspaceEmbeddingStatusQuery,
      variables: { workspaceId },
    }).then(res => res.queryWorkspaceEmbeddingStatus);
  }
}
