import type { RealtimeRequestName, RealtimeTopicName } from '@affine/realtime';
import { Injectable } from '@nestjs/common';

import type { RealtimeRequestHandler, RealtimeTopicHandler } from './types';

@Injectable()
export class RealtimeRegistry {
  private readonly requests = new Map<
    RealtimeRequestName,
    RealtimeRequestHandler<RealtimeRequestName>
  >();
  private readonly topics = new Map<
    RealtimeTopicName,
    RealtimeTopicHandler<RealtimeTopicName>
  >();

  registerRequest<Op extends RealtimeRequestName>(
    handler: RealtimeRequestHandler<Op>
  ) {
    if (this.requests.has(handler.name)) {
      throw new Error(
        `Realtime request handler already registered: ${handler.name}`
      );
    }
    this.requests.set(
      handler.name,
      handler as RealtimeRequestHandler<RealtimeRequestName>
    );
  }

  registerTopic<Topic extends RealtimeTopicName>(
    handler: RealtimeTopicHandler<Topic>
  ) {
    if (this.topics.has(handler.name)) {
      throw new Error(
        `Realtime topic handler already registered: ${handler.name}`
      );
    }
    this.topics.set(
      handler.name,
      handler as RealtimeTopicHandler<RealtimeTopicName>
    );
  }

  getRequest(name: RealtimeRequestName) {
    const handler = this.requests.get(name);
    if (!handler) {
      throw new Error(`Realtime request handler not found: ${name}`);
    }
    return handler;
  }

  getTopic(name: RealtimeTopicName) {
    const handler = this.topics.get(name);
    if (!handler) {
      throw new Error(`Realtime topic handler not found: ${name}`);
    }
    return handler;
  }
}
