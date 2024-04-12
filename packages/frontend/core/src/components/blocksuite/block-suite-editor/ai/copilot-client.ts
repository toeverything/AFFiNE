import {
  createCopilotMessageMutation,
  createCopilotSessionMutation,
  fetcher,
  getBaseUrl,
  getCopilotHistoriesQuery,
  getCopilotSessionsQuery,
  type GraphQLQuery,
  type RequestOptions,
} from '@affine/graphql';

type OptionsField<T extends GraphQLQuery> =
  RequestOptions<T>['variables'] extends { options: infer U } ? U : never;

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
    options?: OptionsField<typeof getCopilotHistoriesQuery>
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

  async textToText(message: string, sessionId: string) {
    const res = await fetch(
      `${this.backendUrl}/api/copilot/chat/${sessionId}?message=${encodeURIComponent(message)}`
    );
    if (!res.ok) return;
    return res.text();
  }

  textToTextStream(message: string, sessionId: string) {
    return new EventSource(
      `${this.backendUrl}/api/copilot/chat/${sessionId}/stream?message=${encodeURIComponent(message)}`
    );
  }

  chatText({
    sessionId,
    messageId,
    message,
  }: {
    sessionId: string;
    messageId?: string;
    message?: string;
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
    return fetch(url.toString());
  }

  // Text or image to text
  chatTextStream({
    sessionId,
    messageId,
    message,
  }: {
    sessionId: string;
    messageId?: string;
    message?: string;
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
    return new EventSource(url.toString());
  }

  // Text or image to images
  imagesStream(messageId: string, sessionId: string) {
    return new EventSource(
      `${this.backendUrl}/api/copilot/chat/${sessionId}/images?messageId=${messageId}`
    );
  }
}
