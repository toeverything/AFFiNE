import './config';

import {
  FactoryProvider,
  INestApplicationContext,
  Module,
  Provider,
} from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server } from 'socket.io';

import { Config } from '../config';

export const SocketIoAdapterImpl = Symbol('SocketIoAdapterImpl');

export class SocketIoAdapter extends IoAdapter {
  constructor(protected readonly app: INestApplicationContext) {
    super(app);
  }

  override createIOServer(port: number, options?: any): Server {
    const config = this.app.get(WEBSOCKET_OPTIONS);
    return super.createIOServer(port, { ...config, ...options });
  }
}

const SocketIoAdapterImplProvider: Provider = {
  provide: SocketIoAdapterImpl,
  useValue: SocketIoAdapter,
};

export const WEBSOCKET_OPTIONS = Symbol('WEBSOCKET_OPTIONS');

export const websocketOptionsProvider: FactoryProvider = {
  provide: WEBSOCKET_OPTIONS,
  useFactory: (config: Config) => {
    return config.websocket;
  },
  inject: [Config],
};

@Module({
  providers: [SocketIoAdapterImplProvider, websocketOptionsProvider],
  exports: [SocketIoAdapterImplProvider, websocketOptionsProvider],
})
export class WebSocketModule {}
