import type { CommentChangeObjectType } from '@affine/graphql';

export type RealtimeRequestName = keyof RealtimeRequestMap;
export type RealtimeTopicName = keyof RealtimeTopicMap;

export interface RealtimeRequestMap {
  'notification.count.get': {
    input: Record<string, never>;
    output: { count: number };
  };
  'comment.changes.get': {
    input: {
      workspaceId: string;
      docId: string;
      after?: string;
      first?: number;
    };
    output: {
      changes: CommentChangeObjectType[];
      startCursor: string;
      endCursor: string;
      hasNextPage: boolean;
    };
  };
  'workspace.embedding.progress.get': {
    input: { workspaceId: string };
    output: { total: number; embedded: number };
  };
  'copilot.transcript.task.get': {
    input: {
      workspaceId: string;
      blobId?: string;
      taskId?: string;
    };
    output: { task: unknown | null };
  };
  'user.quota-state.get': {
    input: Record<string, never>;
    output: { state: unknown };
  };
  'workspace.quota-state.get': {
    input: { workspaceId: string };
    output: { state: unknown };
  };
}

export type NotificationCountChangedReason =
  | 'created'
  | 'read'
  | 'read-all'
  | 'expired-cleanup'
  | 'resync';

export type WorkspaceEmbeddingProgressReason =
  | 'queued'
  | 'progress'
  | 'finished'
  | 'failed'
  | 'resync';

export interface RealtimeTopicMap {
  'notification.count.changed': {
    input: Record<string, never>;
    event: {
      count: number;
      reason: NotificationCountChangedReason;
    };
  };
  'comment.changed': {
    input: {
      workspaceId: string;
      docId: string;
    };
    event: {
      changed: true;
      cursor?: string;
    };
  };
  'workspace.embedding.progress.changed': {
    input: { workspaceId: string };
    event: {
      total?: number;
      embedded?: number;
      reason: WorkspaceEmbeddingProgressReason;
    };
  };
  'copilot.transcript.task.changed': {
    input: {
      workspaceId: string;
      taskId: string;
    };
    event: {
      taskId: string;
      status: string;
      error?: string;
    };
  };
  'user.quota-state.changed': {
    input: Record<string, never>;
    event: { changed: true };
  };
  'workspace.quota-state.changed': {
    input: { workspaceId: string };
    event: { changed: true };
  };
}

export type RealtimeRequestInputOf<Op extends RealtimeRequestName> =
  RealtimeRequestMap[Op]['input'];
export type RealtimeRequestOutputOf<Op extends RealtimeRequestName> =
  RealtimeRequestMap[Op]['output'];
export type RealtimeTopicInputOf<Topic extends RealtimeTopicName> =
  RealtimeTopicMap[Topic]['input'];
export type RealtimeTopicEventOf<Topic extends RealtimeTopicName> =
  RealtimeTopicMap[Topic]['event'];

export type RealtimeError = {
  name: string;
  message: string;
  code?: string;
};

export type RealtimeAck<T> = { data: T } | { error: RealtimeError };

export type RealtimeRequestId = string;
export type RealtimeSubscriptionId = string;

export type RealtimeRequestEnvelope<
  Op extends RealtimeRequestName = RealtimeRequestName,
> = {
  requestId?: RealtimeRequestId;
  op: Op;
  input: RealtimeRequestInputOf<Op>;
  clientVersion?: string;
};

export type RealtimeRequestInput<
  Op extends RealtimeRequestName = RealtimeRequestName,
> = Op extends RealtimeRequestName
  ? {
      op: Op;
      input: RealtimeRequestInputOf<Op>;
      timeoutMs?: number;
    }
  : never;

export type RealtimeRequestOutput<
  Op extends RealtimeRequestName = RealtimeRequestName,
> = RealtimeRequestOutputOf<Op>;

export type RealtimeSubscribeEnvelope<
  Topic extends RealtimeTopicName = RealtimeTopicName,
> = {
  subscriptionId?: RealtimeSubscriptionId;
  topic: Topic;
  input: RealtimeTopicInputOf<Topic>;
  clientVersion?: string;
};

export type RealtimeSubscribeInput<
  Topic extends RealtimeTopicName = RealtimeTopicName,
> = Topic extends RealtimeTopicName
  ? {
      topic: Topic;
      input: RealtimeTopicInputOf<Topic>;
    }
  : never;

export type RealtimeUnsubscribeEnvelope = {
  subscriptionId?: RealtimeSubscriptionId;
  topic: RealtimeTopicName;
  input: RealtimeTopicInputOf<RealtimeTopicName>;
  clientVersion?: string;
};

export type RealtimeReadyEvent = {
  type: 'ready';
  snapshot?: unknown;
};

export type RealtimeSubscriptionReady = RealtimeReadyEvent;

export type RealtimeEvent<Topic extends RealtimeTopicName = RealtimeTopicName> =
  Topic extends RealtimeTopicName
    ? {
        topic: Topic;
        inputKey: string;
        seq?: number;
        sentAt: number;
        event: RealtimeTopicEventOf<Topic>;
      }
    : never;

export type RealtimeTopicEvent<
  Topic extends RealtimeTopicName = RealtimeTopicName,
> = RealtimeTopicEventOf<Topic> | RealtimeReadyEvent;

export type RealtimeStatus = {
  endpoint?: string;
  connected: boolean;
  connecting: boolean;
  subscriptions: number;
  lastError?: RealtimeError;
};

export type RealtimeConfigureInput = {
  endpoint: string;
  isSelfHosted: boolean;
  authenticated: boolean;
  clientVersion?: string;
};

export function getRealtimeInputKey(input: unknown): string {
  if (
    input === undefined ||
    typeof input === 'function' ||
    typeof input === 'symbol'
  ) {
    return 'null';
  }
  if (input === null || typeof input !== 'object') {
    return JSON.stringify(input);
  }
  if (Array.isArray(input)) {
    return `[${input.map(getRealtimeInputKey).join(',')}]`;
  }
  if (input instanceof Date) {
    return JSON.stringify(input.toJSON());
  }
  const record = input as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter(key => {
      const property = record[key];
      return (
        property !== undefined &&
        typeof property !== 'function' &&
        typeof property !== 'symbol'
      );
    })
    .sort()
    .map(key => `${JSON.stringify(key)}:${getRealtimeInputKey(record[key])}`)
    .join(',')}}`;
}
