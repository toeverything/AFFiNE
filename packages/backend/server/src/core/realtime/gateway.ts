import type {
  RealtimeRequestEnvelope,
  RealtimeSubscribeEnvelope,
  RealtimeUnsubscribeEnvelope,
} from '@affine/realtime';
import { getRealtimeInputKey } from '@affine/realtime';
import { applyDecorators, Logger, UseInterceptors } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage as RawSubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ClsInterceptor } from 'nestjs-cls';
import semver from 'semver';
import type { Server, Socket } from 'socket.io';

import {
  checkCanaryDateClientVersion,
  GatewayErrorWrapper,
  OnEvent,
  UnsupportedClientVersion,
} from '../../base';
import { CurrentUser } from '../auth';
import { RealtimePublisher } from './publisher';
import { RealtimeRegistry } from './registry';
import type { RealtimePublishPayload } from './types';

const SubscribeMessage = (event: string) =>
  applyDecorators(GatewayErrorWrapper(event), RawSubscribeMessage(event));

const MIN_REALTIME_CLIENT_VERSION = new semver.Range('>=0.26.0-0', {
  includePrerelease: true,
});

function normalizeRealtimeClientVersion(clientVersion: string): string | null {
  const canaryCheck = checkCanaryDateClientVersion(clientVersion);
  if (!canaryCheck.matched) {
    return clientVersion;
  }

  if (!env.namespaces.canary) {
    return null;
  }

  return canaryCheck.allowed ? canaryCheck.normalized : null;
}

@WebSocketGateway()
@UseInterceptors(ClsInterceptor)
export class RealtimeGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly subscriptions = new Map<
    string,
    { socketId: string; room: string }
  >();

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly registry: RealtimeRegistry,
    private readonly publisher: RealtimePublisher
  ) {}

  afterInit(_server: Server) {
    this.publisher.attachServer(this.server);
  }

  handleDisconnect(client: Socket) {
    for (const [subscriptionId, subscription] of this.subscriptions) {
      if (subscription.socketId === client.id) {
        this.subscriptions.delete(subscriptionId);
      }
    }
  }

  @SubscribeMessage('realtime:request')
  async onRequest(
    @CurrentUser() user: CurrentUser,
    @MessageBody() envelope: RealtimeRequestEnvelope
  ) {
    this.assertVersion(envelope.clientVersion);
    const handler = this.registry.getRequest(envelope.op);
    const input = handler.input.parse(envelope.input);
    return { data: await handler.handle(user, input as never) };
  }

  @SubscribeMessage('realtime:subscribe')
  async onSubscribe(
    @CurrentUser() user: CurrentUser,
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: RealtimeSubscribeEnvelope
  ) {
    this.assertVersion(envelope.clientVersion);
    const handler = this.registry.getTopic(envelope.topic);
    const input = handler.input.parse(envelope.input);
    await handler.authorize(user, input as never);
    const room = handler.room(user, input as never);
    await client.join(room);
    const subscriptionId = `${client.id}:${envelope.topic}:${getRealtimeInputKey(input)}`;
    this.subscriptions.set(subscriptionId, {
      socketId: client.id,
      room,
    });
    return { data: { subscriptionId } };
  }

  @SubscribeMessage('realtime:unsubscribe')
  async onUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() envelope: RealtimeUnsubscribeEnvelope
  ) {
    this.assertVersion(envelope.clientVersion);
    if (!envelope.subscriptionId) {
      return { data: { ok: true } };
    }
    const subscription = this.subscriptions.get(envelope.subscriptionId);
    if (subscription?.socketId === client.id) {
      await client.leave(subscription.room);
      this.subscriptions.delete(envelope.subscriptionId);
    }
    return { data: { ok: true } };
  }

  @OnEvent('realtime.topic.changed', { suppressError: true })
  onRealtimeTopicChanged(payload: RealtimePublishPayload) {
    try {
      this.publisher.publishLocal(payload);
    } catch (error) {
      this.logger.error('Failed to publish realtime event', error);
    }
  }

  private assertVersion(clientVersion?: string) {
    const normalized = clientVersion
      ? normalizeRealtimeClientVersion(clientVersion)
      : null;
    if (
      !normalized ||
      !semver.valid(normalized) ||
      !MIN_REALTIME_CLIENT_VERSION.test(normalized)
    ) {
      throw new UnsupportedClientVersion({
        clientVersion: clientVersion ?? 'unset_or_invalid',
        requiredVersion: '>=0.26.0',
      });
    }
  }
}
