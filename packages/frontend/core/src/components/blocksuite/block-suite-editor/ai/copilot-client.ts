import { showAILoginRequiredAtom } from '@affine/core/components/affine/auth/ai-login-required';
import {
  cleanupCopilotSessionMutation,
  createCopilotMessageMutation,
  createCopilotSessionMutation,
  fetcher as defaultFetcher,
  getBaseUrl,
  getCopilotHistoriesQuery,
  getCopilotSessionsQuery,
  GraphQLError,
  type GraphQLQuery,
  type QueryOptions,
  type RequestOptions,
} from '@affine/graphql';
import {
  GeneralNetworkError,
  PaymentRequiredError,
  UnauthorizedError,
} from '@blocksuite/blocks';
import { getCurrentStore } from '@toeverything/infra';

type OptionsField<T extends GraphQLQuery> =
  RequestOptions<T>['variables'] extends { options: infer U } ? U : never;

function codeToError(code: number) {
  switch (code) {
    case 401:
      return new UnauthorizedError();
    case 402:
      return new PaymentRequiredError();
    default:
      return new GeneralNetworkError();
  }
}

type ErrorType =
  | GraphQLError[]
  | GraphQLError
  | { status: number }
  | Error
  | string;

export function resolveError(src: ErrorType) {
  if (typeof src === 'string') {
    return new GeneralNetworkError(src);
  } else if (src instanceof GraphQLError || Array.isArray(src)) {
    // only resolve the first error
    const error = Array.isArray(src) ? src.at(0) : src;
    const code = error?.extensions?.code;
    return codeToError(code ?? 500);
  } else {
    return codeToError(src instanceof Error ? 500 : src.status);
  }
}

export function handleError(src: ErrorType) {
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
  } catch (_err) {
    const err = _err as GraphQLError | GraphQLError[] | Error | string;
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
  chatTextStream({
    sessionId,
    messageId,
  }: {
    sessionId: string;
    messageId?: string;
  }) {
    const url = new URL(
      `${this.backendUrl}/api/copilot/chat/${sessionId}/stream`
    );
    if (messageId) url.searchParams.set('messageId', messageId);
    return new EventSource(url.toString());
  }

  // Text or image to images
  imagesStream(sessionId: string, messageId?: string, seed?: string) {
    const url = new URL(
      `${this.backendUrl}/api/copilot/chat/${sessionId}/images`
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
