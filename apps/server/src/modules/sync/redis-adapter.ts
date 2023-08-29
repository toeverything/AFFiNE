import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | undefined;

  async connectToRedis(
    host: string,
    port: number,
    username: string,
    password: string,
    db: number
  ): Promise<void> {
    const pubClient = new Redis(port, host, {
      username,
      password,
      db,
    });
    pubClient.on('error', err => {
      console.error(err);
    });
    const subClient = pubClient.duplicate();
    subClient.on('error', err => {
      console.error(err);
    });

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  override createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
