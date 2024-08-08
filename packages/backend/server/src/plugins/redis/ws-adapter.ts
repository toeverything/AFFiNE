import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Server, ServerOptions } from 'socket.io';

import { SocketIoAdapter } from '../../fundamentals/websocket';

export function createSockerIoAdapterImpl(
  redis: Redis
): typeof SocketIoAdapter {
  class RedisIoAdapter extends SocketIoAdapter {
    override createIOServer(port: number, options?: ServerOptions): Server {
      const pubClient = redis;
      pubClient.on('error', err => {
        console.error(err);
      });
      const subClient = pubClient.duplicate();
      subClient.on('error', err => {
        console.error(err);
      });

      const server = super.createIOServer(port, options);
      server.adapter(createAdapter(pubClient, subClient));
      return server;
    }
  }

  return RedisIoAdapter;
}
