import {
  getRealtimeInputKey,
  type RealtimeEvent,
  type RealtimeTopicName,
} from '@affine/realtime';
import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

import { EventBus } from '../../base';
import { RealtimeRegistry } from './registry';
import type { RealtimePublishPayload } from './types';

@Injectable()
export class RealtimePublisher {
  private readonly logger = new Logger(RealtimePublisher.name);
  private server?: Server;

  constructor(
    private readonly registry: RealtimeRegistry,
    private readonly event: EventBus
  ) {}

  attachServer(server: Server) {
    this.server = server;
  }

  publish<Topic extends RealtimeTopicName>(
    topic: Topic,
    input: RealtimePublishPayload<Topic>['input'],
    event: RealtimePublishPayload<Topic>['event'],
    options?: { room?: string }
  ) {
    const payload = {
      topic,
      input,
      event,
      room: options?.room,
    } as RealtimePublishPayload<Topic>;
    try {
      this.publishLocal(payload);
      this.event.broadcast('realtime.topic.changed', payload);
    } catch (error) {
      this.logger.error(`Failed to publish realtime topic ${topic}`, error);
    }
  }

  publishLocal(payload: RealtimePublishPayload) {
    const handler = this.registry.getTopic(payload.topic);
    const room = payload.room ?? handler.room(null, payload.input as never);
    const envelope: RealtimeEvent = {
      topic: payload.topic,
      inputKey: getRealtimeInputKey(payload.input),
      sentAt: Date.now(),
      event: payload.event as never,
    };
    this.server?.to(room).emit('realtime:event', envelope);
  }
}
