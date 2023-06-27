import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

@WebSocketGateway()
export class EventsGateway {
  @WebSocketServer()
  server: any;

  @SubscribeMessage('event')
  handleDemoEvent(@MessageBody('guid') _guid: string) {
    this.server.emit('event', { data: 'hello' });
  }
}
