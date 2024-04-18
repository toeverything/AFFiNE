import {
  createCopilotMessageMutation,
  createCopilotSessionMutation,
  fetcher as defaultFetcher,
  getBaseUrl,
  getCopilotHistoriesQuery,
  getCopilotSessionsQuery,
  type GraphQLQuery,
  type QueryOptions,
  type RequestOptions,
} from '@affine/graphql';
import { GeneralNetworkError, PaymentRequiredError } from '@blocksuite/blocks';

type OptionsField<T extends GraphQLQuery> =
  RequestOptions<T>['variables'] extends { options: infer U } ? U : never;

const fetcher = async <Query extends GraphQLQuery>(
  options: QueryOptions<Query>
) => {
  try {
    return await defaultFetcher<Query>(options);
  } catch (_err) {
    const error = Array.isArray(_err) ? _err.at(0) : _err;
    if (error.extensions?.code === 402) {
      throw new PaymentRequiredError();
    }
    throw new GeneralNetworkError();
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

  async chatText({
    sessionId,
    messageId,
    message,
    params,
  }: {
    sessionId: string;
    messageId?: string;
    message?: string;
    params?: Record<string, string>;
  }) {
    if (messageId && message) {
      throw new Error('Only one of messageId or message can be provided');
    } else if (!messageId && !message) {
      throw new Error('Either messageId or message must be provided');
    }
    const url = new URL(`${this.backendUrl}/api/copilot/chat/${sessionId}`);
    if (messageId) {
      url.searchParams.set('messageId', messageId);
    }
    if (message) {
      url.searchParams.set('message', message);
    }
    if (!messageId && params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    const response = await fetch(url.toString());
    return response.text();
  }

  // Text or image to text
  chatTextStream({
    sessionId,
    messageId,
    message,
    params,
  }: {
    sessionId: string;
    messageId?: string;
    message?: string;
    params?: Record<string, string>;
  }) {
    if (messageId && message) {
      throw new Error('Only one of messageId or message can be provided');
    } else if (!messageId && !message) {
      throw new Error('Either messageId or message must be provided');
    }
    const url = new URL(
      `${this.backendUrl}/api/copilot/chat/${sessionId}/stream`
    );
    if (messageId) {
      url.searchParams.set('messageId', messageId);
    }
    if (message) {
      url.searchParams.set('message', message);
    }
    if (!messageId && params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
    return new EventSource(url.toString());
  }

  // Text or image to images
  imagesStream(messageId: string, sessionId: string) {
    return new EventSource(
      `${this.backendUrl}/api/copilot/chat/${sessionId}/images?messageId=${messageId}`
    );
  }
}
