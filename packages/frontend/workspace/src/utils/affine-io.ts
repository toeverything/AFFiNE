import { Manager } from 'socket.io-client';

let ioManager: Manager | null = null;

// use lazy initialization socket.io io manager
export function getIoManager(): Manager {
  if (ioManager) {
    return ioManager;
  }
  const { protocol, hostname, port } = window.location;
  ioManager = new Manager(
    `${protocol === 'https:' ? 'wss' : 'ws'}://${hostname}${
      port ? `:${port}` : ''
    }/`,
    {
      autoConnect: false,
      transports: ['websocket'],
      secure: location.protocol === 'https:',
    }
  );
  return ioManager;
}
