import type { RealtimeRequestName, RealtimeTopicName } from '@affine/realtime';

import type { RealtimeRegistry } from './registry';
import type { RealtimeRequestHandler, RealtimeTopicHandler } from './types';

export type RealtimeLiveQueryDefinition<
  Request extends RealtimeRequestName,
  Topic extends RealtimeTopicName,
> = {
  request: RealtimeRequestHandler<Request>;
  topic: RealtimeTopicHandler<Topic>;
};

export function registerRealtimeLiveQuery<
  Request extends RealtimeRequestName,
  Topic extends RealtimeTopicName,
>(
  registry: RealtimeRegistry | undefined,
  definition: RealtimeLiveQueryDefinition<Request, Topic>
) {
  registry?.registerRequest(definition.request);
  registry?.registerTopic(definition.topic);
}
