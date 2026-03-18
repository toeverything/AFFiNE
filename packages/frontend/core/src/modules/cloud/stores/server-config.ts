import { UserFriendlyError } from '@affine/error';
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

const NETWORK_ERROR_PATTERNS = [
  /failed to fetch/i,
  /network request failed/i,
  /fetch failed/i,
  /load failed/i,
  /networkerror/i,
  /cors/i,
  /certificate/i,
  /ssl/i,
  /err_[a-z_]+/i,
];

function mapServerConfigError(error: unknown) {
  const userFriendlyError = UserFriendlyError.fromAny(error);
  if (
    userFriendlyError.is('NETWORK_ERROR') ||
    userFriendlyError.is('REQUEST_ABORTED') ||
    userFriendlyError.is('TOO_MANY_REQUEST')
  ) {
    return userFriendlyError;
  }

  if (error instanceof Error) {
    const detail = `${error.name}: ${error.message}`;
    if (NETWORK_ERROR_PATTERNS.some(pattern => pattern.test(detail))) {
      return new UserFriendlyError({
        status: 504,
        code: 'NETWORK_ERROR',
        type: 'NETWORK_ERROR',
        name: 'NETWORK_ERROR',
        message: detail,
        stacktrace: error.stack,
      });
    }
  }

  return userFriendlyError;
}

export class ServerConfigStore extends Store {
  constructor() {
    super();
  }

  async fetchServerConfig(
    serverBaseUrl: string,
    abortSignal?: AbortSignal
  ): Promise<ServerConfigType> {
    try {
      const gql = gqlFetcherFactory(
        `${serverBaseUrl}/graphql`,
        globalThis.fetch
      );
      const serverConfigData = await gql({
        query: serverConfigQuery,
        context: {
          signal: abortSignal,
          headers: {
            'x-affine-version': BUILD_CONFIG.appVersion,
          },
        },
      });
      if (
        serverConfigData.serverConfig.features.includes(ServerFeature.OAuth)
      ) {
        const oauthProvidersData = await gql({
          query: oauthProvidersQuery,
          context: {
            signal: abortSignal,
            headers: {
              'x-affine-version': BUILD_CONFIG.appVersion,
            },
          },
        });
        return {
          ...serverConfigData.serverConfig,
          ...oauthProvidersData.serverConfig,
        };
      }
      return { ...serverConfigData.serverConfig, oauthProviders: [] };
    } catch (error) {
      throw mapServerConfigError(error);
    }
  }
}
