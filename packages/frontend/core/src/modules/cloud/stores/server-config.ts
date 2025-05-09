import {
  gqlFetcherFactory,
  type OauthProvidersQuery,
  oauthProvidersQuery,
  type ServerConfigQuery,
  serverConfigQuery,
  ServerFeature,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

export type ServerConfigType = ServerConfigQuery['serverConfig'] &
  OauthProvidersQuery['serverConfig'];

export class ServerConfigStore extends Store {
  constructor() {
    super();
  }

  async fetchServerConfig(
    serverBaseUrl: string,
    abortSignal?: AbortSignal
  ): Promise<ServerConfigType> {
    const gql = gqlFetcherFactory(`${serverBaseUrl}/graphql`, globalThis.fetch);
    const serverConfigData = await gql({
      query: serverConfigQuery,
      context: {
        signal: abortSignal,
      },
    });
    if (serverConfigData.serverConfig.features.includes(ServerFeature.OAuth)) {
      const oauthProvidersData = await gql({
        query: oauthProvidersQuery,
        context: {
          signal: abortSignal,
        },
      });
      return {
        ...serverConfigData.serverConfig,
        ...oauthProvidersData.serverConfig,
      };
    }
    return { ...serverConfigData.serverConfig, oauthProviders: [] };
  }
}
