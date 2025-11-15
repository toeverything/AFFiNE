import {
  effect,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  Service,
  smartRetry,
} from '@toeverything/infra';
import { catchError, EMPTY, exhaustMap, groupBy, mergeMap, tap } from 'rxjs';

import type { PublicUserStore } from '../stores/public-user';

type RemovedUserInfo = {
  id: string;
  removed: true;
};

type ExistedUserInfo = {
  id: string;
  name?: string | null;
  avatar?: string | null;
  avatarUrl?: string | null;
  removed?: false;
};

export type PublicUserInfo = RemovedUserInfo | ExistedUserInfo;

export class PublicUserService extends Service {
  constructor(private readonly store: PublicUserStore) {
    super();
  }

  private readonly publicUsers$ = new LiveData<
    Map<string, PublicUserInfo | null>
  >(new Map());
  private readonly isLoadings$ = new LiveData<Map<string, boolean | null>>(
    new Map()
  );
  private readonly errors$ = new LiveData<Map<string, any | null>>(new Map());

  publicUser$(id: string) {
    return this.publicUsers$.selector(map => map.get(id) ?? null);
  }

  isLoading$(id: string) {
    return this.isLoadings$.selector(map => map.get(id) ?? false);
  }

  error$(id: string) {
    return this.errors$.selector(map => map.get(id));
  }

  private setPublicUser(id: string, userInfo: PublicUserInfo) {
    // Reusing the existing publicUsers Map instance instead of creating a new one.
    // While this doesn't follow immutability best practices, it reduces memory overhead
    // by avoiding the creation of new Map objects for each update.
    const publicUsers = this.publicUsers$.value;
    publicUsers.set(id, userInfo);
    this.publicUsers$.next(publicUsers);
  }

  private setLoading(id: string, loading: boolean) {
    // Similar to setPublicUser, reusing the existing Map instance to reduce memory overhead
    const loadings = this.isLoadings$.value;
    loadings.set(id, loading);
    this.isLoadings$.next(loadings);
  }

  private setError(id: string, error: any | null) {
    // Reusing the existing Map instance instead of creating a new one
    const errors = this.errors$.value;
    errors.set(id, error);
    this.errors$.next(errors);
  }

  revalidate = effect(
    groupBy((id: string) => id),
    mergeMap(id$ =>
      id$.pipe(
        exhaustMap(id =>
          fromPromise(async signal => {
            const user = await this.store.getPublicUserById(id, signal);
            if (!user) {
              return {
                id,
                removed: true,
              };
            }
            return {
              id,
              name: user.name,
              avatar: user.avatarUrl,
              avatarUrl: user.avatarUrl,
            };
          }).pipe(
            smartRetry(),
            catchError(error => {
              console.error(error);
              this.setError(id, error);
              return EMPTY;
            }),
            tap(user => {
              this.setPublicUser(id, user);
              this.setError(id, null); // clear error
            }),
            onStart(() => this.setLoading(id, true)),
            onComplete(() => this.setLoading(id, false))
          )
        )
      )
    )
  );
}
