import { Manager } from 'socket.io-client';

let ioManager: Manager | null = null;

function getBaseUrl(): string {
  if (environment.isDesktop) {
    return runtimeConfig.serverUrlPrefix;
  }
  const { protocol, hostname, port } = window.location;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${hostname}${
    port ? `:${port}` : ''
  }`;
}

// use lazy initialization socket.io io manager
export function getIoManager(): Manager {
  if (ioManager) {
    return ioManager;
  }
  ioManager = new Manager(`${getBaseUrl()}/`, {
    autoConnect: false,
    transports: ['websocket'],
    secure: location.protocol === 'https:',
  });
  return ioManager;
}
