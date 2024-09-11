import { ApplicationStarted, OnEvent, Service } from '@toeverything/infra';
import { Manager } from 'socket.io-client';

import { getAffineCloudBaseUrl } from '../services/fetch';
import type { AuthService } from './auth';
import { AccountChanged } from './auth';

@OnEvent(AccountChanged, e => e.update)
@OnEvent(ApplicationStarted, e => e.update)
export class WebSocketService extends Service {
  ioManager: Manager = new Manager(`${getAffineCloudBaseUrl()}/`, {
    autoConnect: false,
    transports: ['websocket'],
    secure: location.protocol === 'https:',
  });
  socket = this.ioManager.socket('/');
  refCount = 0;

  constructor(private readonly authService: AuthService) {
    super();
  }

  /**
   * Connect socket, with automatic connect and reconnect logic.
   * External code should not call `socket.connect()` or `socket.disconnect()` manually.
   * When socket is no longer needed, call `dispose()` to clean up resources.
   */
  connect() {
    this.refCount++;
    this.update();
    return {
      socket: this.socket,
      dispose: () => {
        this.refCount--;
        this.update();
      },
    };
  }

  update(): void {
    if (this.authService.session.account$.value && this.refCount > 0) {
      this.socket.connect();
    } else {
      this.socket.disconnect();
    }
  }
}
