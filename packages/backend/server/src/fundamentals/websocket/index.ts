import { Module, Provider } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

export const SocketIoAdapterImpl = Symbol('SocketIoAdapterImpl');

export class SocketIoAdapter extends IoAdapter {}

const SocketIoAdapterImplProvider: Provider = {
  provide: SocketIoAdapterImpl,
  useValue: SocketIoAdapter,
};

@Module({
  providers: [SocketIoAdapterImplProvider],
  exports: [SocketIoAdapterImplProvider],
})
export class WebSocketModule {}
