import { type QueryResponse, serverConfigQuery } from '@affine/graphql';
import { Manager } from 'socket.io-client';

import { fetcher } from '../affine/gql';

type ServerConfig = QueryResponse<typeof serverConfigQuery>['serverConfig'];

let ioManager: Manager | null = null;

let serverConfig: ServerConfig | null = null;

async function fetchServerConfig() {
  const { serverConfig } = await fetcher({ query: serverConfigQuery });
  return serverConfig;
}

let serverConfigInterval: NodeJS.Timeout | null = null;

function initServerConfig() {
  if (!serverConfigInterval) {
    serverConfigInterval = setInterval(() => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      fetchServerConfig().then(config => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        clearInterval(serverConfigInterval!);
        serverConfig = config;
        serverConfigInterval = null;

        // listen to network change
        window.addEventListener('offline', () => {
          serverConfig = null;
          // re-init if network is up after down
          window.addEventListener('online', () => {
            setTimeout(() => {
              initServerConfig();
            }, 500);
          });
        });
      });
    }, 500);
  }
}

initServerConfig();

function getBaseUrl(): string {
  if (serverConfig) {
    return serverConfig.baseUrl;
  }
  // fallback to compile time config
  return runtimeConfig.serverUrlPrefix;
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
