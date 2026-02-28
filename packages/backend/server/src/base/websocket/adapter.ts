import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server, Socket } from 'socket.io';

import { Config } from '../config';
import { AuthenticationRequired } from '../error';
import { SocketIoRedis } from '../redis';
import { WEBSOCKET_OPTIONS } from './options';

export class SocketIoAdapter extends IoAdapter {
  constructor(private readonly app: INestApplication) {
    super(app);
  }

  override createIOServer(port: number, options?: any): Server {
    const config = this.app.get(WEBSOCKET_OPTIONS) as Config['websocket'] & {
      canActivate: (socket: Socket) => Promise<boolean>;
    };
    const server: Server = super.createIOServer(port, {
      ...config,
      ...options,
      // Enable CORS for Socket.IO
      cors: {
        origin: true, // Allow all origins
        credentials: true, // Allow credentials (cookies, auth headers)
        methods: ['GET', 'POST'],
      },
    });

    if (config.canActivate) {
      server.use((socket, next) => {
        config
          .canActivate(socket)
          .then(pass => {
            if (pass) {
              next();
            } else {
              throw new AuthenticationRequired();
            }
          })
          .catch(e => {
            next(e);
          });
      });
    }

    const pubClient = this.app.get(SocketIoRedis);
    const subClient = pubClient.duplicate();

    server.adapter(createAdapter(pubClient, subClient));
    const close = server.close;

    server.close = async fn => {
      await close.call(server, fn);
      // NOTE(@forehalo):
      //   the lifecycle of duplicated redis client will not be controlled by nestjs lifecycle
      //   we've got to manually disconnect it
      subClient.disconnect();
    };

    return server;
  }
}
