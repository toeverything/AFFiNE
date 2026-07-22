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
import semver from 'semver';

export type ServerConfigType = ServerConfigQuery['serverConfig'] &
  OauthProvidersQuery['serverConfig'];

export const MIN_SUPPORTED_SERVER_VERSION = '0.27.0';

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

const MISSING_SERVER_VERSION_PATTERNS = [
  /cannot query field ["']?version["']? on type ["']?serverconfigtype["']?/i,
  /field ["']?version["']? is not defined by type ["']?serverconfigtype["']?/i,
];

export function createUnsupportedServerVersionError(version?: string | null) {
  const receivedVersion = version || 'unknown';
  return new UserFriendlyError({
    status: 426,
    code: 'UNSUPPORTED_SERVER_VERSION',
    type: 'UNSUPPORTED_SERVER_VERSION',
    name: 'UNSUPPORTED_SERVER_VERSION',
    message: `Unsupported server with version [${receivedVersion}], required version is [>=${MIN_SUPPORTED_SERVER_VERSION}].`,
    data: {
      serverVersion: receivedVersion,
      requiredVersion: `>=${MIN_SUPPORTED_SERVER_VERSION}`,
    },
  });
}

export function isSupportedServerVersion(version?: string | null) {
  const normalized = version && semver.valid(version, { loose: true });
  return (
    !!normalized &&
    semver.gte(normalized, `${MIN_SUPPORTED_SERVER_VERSION}-0`, {
      loose: true,
    })
  );
}

export function assertSupportedServerVersion(version?: string | null) {
  if (!isSupportedServerVersion(version)) {
    throw createUnsupportedServerVersionError(version);
  }
}

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
    if (MISSING_SERVER_VERSION_PATTERNS.some(pattern => pattern.test(detail))) {
      return createUnsupportedServerVersionError();
    }

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
      assertSupportedServerVersion(serverConfigData.serverConfig.version);
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
