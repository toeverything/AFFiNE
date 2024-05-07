import type {
  OauthProvidersQuery,
  ServerConfigQuery,
  ServerFeature,
} from '@affine/graphql';
import {
  backoffRetry,
  effect,
  Entity,
  fromPromise,
  LiveData,
} from '@toeverything/infra';
import { EMPTY, exhaustMap, mergeMap } from 'rxjs';

import type { ServerConfigStore } from '../stores/server-config';

type LowercaseServerFeature = Lowercase<ServerFeature>;
type ServerFeatureRecord = {
  [key in LowercaseServerFeature]: boolean;
};

export type ServerConfigType = ServerConfigQuery['serverConfig'] &
  OauthProvidersQuery['serverConfig'];

export class ServerConfig extends Entity {
  readonly config$ = new LiveData<ServerConfigType | null>(null);

  readonly features$ = this.config$.map(config => {
    return config
      ? Array.from(new Set(config.features)).reduce((acc, cur) => {
          acc[cur.toLowerCase() as LowercaseServerFeature] = true;
          return acc;
        }, {} as ServerFeatureRecord)
      : null;
  });

  readonly credentialsRequirement$ = this.config$.map(config => {
    return config ? config.credentialsRequirement : null;
  });

  constructor(private readonly store: ServerConfigStore) {
    super();
  }

  revalidate = effect(
    exhaustMap(() => {
      return fromPromise<ServerConfigType>(signal =>
        this.store.fetchServerConfig(signal)
      ).pipe(
        backoffRetry({
          count: Infinity,
        }),
        mergeMap(config => {
          this.config$.next(config);
          return EMPTY;
        })
      );
    })
  );

  revalidateIfNeeded = () => {
    if (!this.config$.value) {
      this.revalidate();
    }
  };

  override dispose(): void {
    this.revalidate.unsubscribe();
  }
}
