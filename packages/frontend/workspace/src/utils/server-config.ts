import { type QueryResponse, serverConfigQuery } from '@affine/graphql';

import { fetcher } from '../affine/gql';

type ServerConfig = QueryResponse<typeof serverConfigQuery>['serverConfig'];

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

export function getServerConfig(): ServerConfig | null {
  return serverConfig;
}
