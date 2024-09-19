import { showAILoginRequiredAtom } from '@affine/core/components/affine/auth/ai-login-required';
import {
  cleanupCopilotSessionMutation,
  createCopilotMessageMutation,
  createCopilotSessionMutation,
  fetcher as defaultFetcher,
  forkCopilotSessionMutation,
  getBaseUrl,
  getCopilotHistoriesQuery,
  getCopilotHistoryIdsQuery,
  getCopilotSessionsQuery,
  GraphQLError,
  type GraphQLQuery,
  type QueryOptions,
  type RequestOptions,
  UserFriendlyError,
} from '@affine/graphql';
import {
  GeneralNetworkError,
  PaymentRequiredError,
  UnauthorizedError,
} from '@blocksuite/affine/blocks';
import { getCurrentStore } from '@toeverything/infra';

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
          : undefined
      );
  }
}

export function resolveError(err: any) {
  const standardError =
    err instanceof GraphQLError
      ? new UserFriendlyError(err.extensions)
      : UserFriendlyError.fromAnyError(err);

  return codeToError(standardError);
}

export function handleError(src: any) {
  const err = resolveError(src);
  if (err instanceof UnauthorizedError) {
    getCurrentStore().set(showAILoginRequiredAtom, true);
  }
  return err;
}

const fetcher = async <Query extends GraphQLQuery>(
  options: QueryOptions<Query>
) => {
  try {
    return await defaultFetcher<Query>(options);
  } catch (err) {
    throw handleError(err);
  }
};

export class CopilotClient {
  readonly backendUrl = getBaseUrl();

  async createSession(
    options: OptionsField<typeof createCopilotSessionMutation>
  ) {
    const res = await fetcher({
      query: createCopilotSessionMutation,
      variables: {
        options,
      },
    });
    return res.createCopilotSession;
  }

  async forkSession(options: OptionsField<typeof forkCopilotSessionMutation>) {
    const res = await fetcher({
      query: forkCopilotSessionMutation,
      variables: {
        options,
      },
    });
    return res.forkCopilotSession;
  }

  async createMessage(
    options: OptionsField<typeof createCopilotMessageMutation>
  ) {
    const res = await fetcher({
      query: createCopilotMessageMutation,
      variables: {
        options,
      },
    });
    return res.createCopilotMessage;
  }

  async getSessions(workspaceId: string) {
    const res = await fetcher({
      query: getCopilotSessionsQuery,
      variables: {
        workspaceId,
      },
    });
    return res.currentUser?.copilot;
  }

  async getHistories(
    workspaceId: string,
    docId?: string,
    options?: RequestOptions<
      typeof getCopilotHistoriesQuery
    >['variables']['options']
  ) {
    const res = await fetcher({
      query: getCopilotHistoriesQuery,
      variables: {
        workspaceId,
        docId,
        options,
      },
    });

    return res.currentUser?.copilot?.histories;
  }

  async getHistoryIds(
    workspaceId: string,
    docId?: string,
    options?: RequestOptions<
      typeof getCopilotHistoriesQuery
    >['variables']['options']
  ) {
    const res = await fetcher({
      query: getCopilotHistoryIdsQuery,
      variables: {
        workspaceId,
        docId,
        options,
      },
    });

    return res.currentUser?.copilot?.histories;
  }

  async cleanupSessions(input: {
    workspaceId: string;
    docId: string;
    sessionIds: string[];
  }) {
    const res = await fetcher({
      query: cleanupCopilotSessionMutation,
      variables: {
        input,
      },
    });
    return res.cleanupCopilotSession;
  }

  async chatText({
    sessionId,
    messageId,
    signal,
  }: {
    sessionId: string;
    messageId?: string;
    signal?: AbortSignal;
  }) {
    const url = new URL(`${this.backendUrl}/api/copilot/chat/${sessionId}`);
    if (messageId) {
      url.searchParams.set('messageId', messageId);
    }
    const response = await fetch(url.toString(), { signal });
    return response.text();
  }

  // Text or image to text
  chatTextStream(
    {
      sessionId,
      messageId,
    }: {
      sessionId: string;
      messageId?: string;
    },
    endpoint = 'stream'
  ) {
    const url = new URL(
      `${this.backendUrl}/api/copilot/chat/${sessionId}/${endpoint}`
    );
    if (messageId) url.searchParams.set('messageId', messageId);
    return new EventSource(url.toString());
  }

  // Text or image to images
  imagesStream(
    sessionId: string,
    messageId?: string,
    seed?: string,
    endpoint = 'images'
  ) {
    const url = new URL(
      `${this.backendUrl}/api/copilot/chat/${sessionId}/${endpoint}`
    );
    if (messageId) {
      url.searchParams.set('messageId', messageId);
    }
    if (seed) {
      url.searchParams.set('seed', seed);
    }
    return new EventSource(url);
  }
}
