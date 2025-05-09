import type { ServerFeature } from '@affine/graphql';
import {
  backoffRetry,
  effect,
  Entity,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { exhaustMap, map, tap } from 'rxjs';

import { ServerScope } from '../scopes/server';
import { AuthService } from '../services/auth';
import { FetchService } from '../services/fetch';
import { GraphQLService } from '../services/graphql';
import { ServerConfigStore } from '../stores/server-config';
import type { ServerListStore } from '../stores/server-list';
import type { ServerConfig, ServerMetadata } from '../types';

type LowercaseServerFeature = Lowercase<ServerFeature>;
type ServerFeatureRecord = {
  [key in LowercaseServerFeature]: boolean;
};

export class Server extends Entity<{
  serverMetadata: ServerMetadata;
}> {
  readonly id = this.props.serverMetadata.id;
  readonly baseUrl = this.props.serverMetadata.baseUrl;
  readonly scope = this.framework.createScope(ServerScope, {
    server: this as Server,
  });

  readonly serverConfigStore = this.scope.framework.get(ServerConfigStore);
  readonly fetch = this.scope.framework.get(FetchService).fetch;
  readonly gql = this.scope.framework.get(GraphQLService).gql;
  get account$() {
    return this.scope.framework.get(AuthService).session.account$;
  }
  readonly serverMetadata = this.props.serverMetadata;

  constructor(private readonly serverListStore: ServerListStore) {
    super();
  }

  readonly config$ = LiveData.from<ServerConfig>(
    this.serverListStore.watchServerConfig(this.serverMetadata.id).pipe(
      map(config => {
        if (!config) {
          throw new Error('Failed to load server config');
        }
        return config;
      })
    ),
    null as any
  );

  readonly isConfigRevalidating$ = new LiveData(false);

  readonly features$ = this.config$.map(config => {
    return Array.from(new Set(config.features)).reduce((acc, cur) => {
      acc[cur.toLowerCase() as LowercaseServerFeature] = true;
      return acc;
    }, {} as ServerFeatureRecord);
  });

  readonly credentialsRequirement$ = this.config$.map(config => {
    return config ? config.credentialsRequirement : null;
  });

  readonly revalidateConfig = effect(
    exhaustMap(() => {
      return fromPromise(signal =>
        this.serverConfigStore.fetchServerConfig(this.baseUrl, signal)
      ).pipe(
        backoffRetry({
          count: Infinity,
        }),
        tap(config => {
          this.serverListStore.updateServerConfig(this.serverMetadata.id, {
            credentialsRequirement: config.credentialsRequirement,
            features: config.features,
            oauthProviders: config.oauthProviders,
            serverName: config.name,
            type: config.type,
            version: config.version,
            initialized: config.initialized,
          });
        }),
        onStart(() => {
          this.isConfigRevalidating$.next(true);
        }),
        onComplete(() => {
          this.isConfigRevalidating$.next(false);
        })
      );
    })
  );

  async waitForConfigRevalidation(signal?: AbortSignal) {
    try {
      this.revalidateConfig();
      await this.isConfigRevalidating$.waitFor(
        isRevalidating => !isRevalidating,
        signal
      );
    } catch (error) {
      if (error instanceof Event && error.type === 'abort') return;
      console.error('Config revalidation failed:', error);
    }
  }

  override dispose(): void {
    this.scope.dispose();
    this.revalidateConfig.unsubscribe();
  }
}
