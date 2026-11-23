import { applyDecorators, UseInterceptors } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage as RawSubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { ClsInterceptor } from 'nestjs-cls';
import { Socket } from 'socket.io';

import { BadRequest, GatewayErrorWrapper } from '../../base';
import { CurrentUser } from '../auth';
import { TelemetryService } from './service';
import { TelemetryAck, type TelemetryBatch } from './types';

const SubscribeMessage = (event: string) =>
  applyDecorators(GatewayErrorWrapper(event), RawSubscribeMessage(event));

type EventResponse<Data = any> = [Data] extends [never]
  ? { data?: never }
  : { data: Data };

@WebSocketGateway()
@UseInterceptors(ClsInterceptor)
export class TelemetryGateway {
  constructor(private readonly telemetry: TelemetryService) {}

  @SubscribeMessage('telemetry:batch')
  async onBatch(
    @CurrentUser() user: CurrentUser,
    @ConnectedSocket() client: Socket,
    @MessageBody() batch: TelemetryBatch
  ): Promise<EventResponse<TelemetryAck>> {
    const origin = client.handshake.headers.origin;
    const referer = client.handshake.headers.referer;
    if (!this.telemetry.isOriginAllowed(origin, referer)) {
      throw new BadRequest(`Invalid origin: ${origin}, referer: ${referer}`);
    }

    const ack = await this.telemetry.collectBatch({
      ...batch,
      transport: 'ws',
      events: batch?.events?.map(event => ({
        ...event,
        userId: event.userId ?? user?.id,
      })),
    });

    return { data: ack };
  }
}
