import { FeatureType } from '@affine/graphql';
import {
  backoffRetry,
  catchErrorInto,
  effect,
  Entity,
  exhaustMapSwitchUntilChanged,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { EMPTY, map, mergeMap } from 'rxjs';

import { isBackendError, isNetworkError } from '../error';
import type { AuthService } from '../services/auth';
import type { UserFeatureStore } from '../stores/user-feature';

export class UserFeature extends Entity {
  // undefined means no user, null means loading
  features$ = new LiveData<FeatureType[] | null | undefined>(null);
  isEarlyAccess$ = this.features$.map(features =>
    features === null
      ? null
      : features?.some(f => f === FeatureType.EarlyAccess)
  );

  isRevalidating$ = new LiveData(false);
  error$ = new LiveData<any | null>(null);

  constructor(
    private readonly authService: AuthService,
    private readonly store: UserFeatureStore
  ) {
    super();
  }

  revalidate = effect(
    map(() => ({
      accountId: this.authService.session.account$.value?.id,
    })),
    exhaustMapSwitchUntilChanged(
      (a, b) => a.accountId === b.accountId,
      ({ accountId }) => {
        return fromPromise(async signal => {
          if (!accountId) {
            return; // no feature if no user
          }

          const { userId, features } = await this.store.getUserFeatures(signal);
          if (userId !== accountId) {
            // The user has changed, ignore the result
            this.authService.session.revalidate();
            await this.authService.session.waitForRevalidation();
            return;
          }
          return {
            userId: userId,
            features: features,
          };
        }).pipe(
          backoffRetry({
            when: isNetworkError,
            count: Infinity,
          }),
          backoffRetry({
            when: isBackendError,
          }),
          mergeMap(data => {
            if (data) {
              this.features$.next(data.features);
            } else {
              this.features$.next(null);
            }
            return EMPTY;
          }),
          catchErrorInto(this.error$),
          onStart(() => this.isRevalidating$.next(true)),
          onComplete(() => this.isRevalidating$.next(false))
        );
      },
      () => {
        // Reset the state when the user is changed
        this.reset();
      }
    )
  );

  reset() {
    this.features$.next(null);
    this.error$.next(null);
    this.isRevalidating$.next(false);
  }
}
