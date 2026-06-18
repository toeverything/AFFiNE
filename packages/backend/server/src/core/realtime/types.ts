import type {
  RealtimeRequestInputOf,
  RealtimeRequestName,
  RealtimeRequestOutputOf,
  RealtimeTopicEventOf,
  RealtimeTopicInputOf,
  RealtimeTopicName,
} from '@affine/realtime';
import type { z } from 'zod';

import type { CurrentUser } from '../auth';

declare global {
  interface Events {
    'realtime.topic.changed': RealtimePublishPayload;
  }
}

export type RealtimeRequestHandler<Op extends RealtimeRequestName> = {
  name: Op;
  input: z.ZodType<RealtimeRequestInputOf<Op>>;
  handle(
    user: CurrentUser,
    input: RealtimeRequestInputOf<Op>
  ): Promise<RealtimeRequestOutputOf<Op>>;
};

export type RealtimeTopicHandler<Topic extends RealtimeTopicName> = {
  name: Topic;
  input: z.ZodType<RealtimeTopicInputOf<Topic>>;
  authorize(
    user: CurrentUser,
    input: RealtimeTopicInputOf<Topic>
  ): Promise<void>;
  room(user: CurrentUser | null, input: RealtimeTopicInputOf<Topic>): string;
};

export type RealtimePublishPayload<
  Topic extends RealtimeTopicName = RealtimeTopicName,
> = {
  topic: Topic;
  input: RealtimeTopicInputOf<Topic>;
  event: RealtimeTopicEventOf<Topic>;
  room?: string;
};
