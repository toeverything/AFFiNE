import { OnEvent, Service } from '@toeverything/infra';
import type { Socket } from 'socket.io-client';
import { Manager } from 'socket.io-client';

import { getAffineCloudBaseUrl } from '../services/fetch';
import { AccountChanged } from './auth';

@OnEvent(AccountChanged, e => e.reconnect)
export class WebSocketService extends Service {
  ioManager: Manager = new Manager(`${getAffineCloudBaseUrl()}/`, {
    autoConnect: false,
    transports: ['websocket'],
    secure: location.protocol === 'https:',
  });
  sockets: Set<Socket> = new Set();

  constructor() {
    super();
  }

  newSocket(): Socket {
    const socket = this.ioManager.socket('/');
    this.sockets.add(socket);

    return socket;
  }

  reconnect(): void {
    for (const socket of this.sockets) {
      socket.disconnect();
    }

    for (const socket of this.sockets) {
      socket.connect();
    }
  }
}
