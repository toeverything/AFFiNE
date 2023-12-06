import { Manager } from 'socket.io-client';

let ioManager: Manager | null = null;

// use lazy initialization socket.io io manager
export function getIoManager(): Manager {
  if (ioManager) {
    return ioManager;
  }
  ioManager = new Manager(runtimeConfig.serverUrlPrefix + '/', {
    autoConnect: false,
    transports: ['websocket'],
  });
  return ioManager;
}
