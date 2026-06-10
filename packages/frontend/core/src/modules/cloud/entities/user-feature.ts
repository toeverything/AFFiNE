import { FeatureType } from '@affine/graphql';
import {
  catchErrorInto,
  effect,
  Entity,
  exhaustMapSwitchUntilChanged,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  smartRetry,
} from '@toeverything/infra';
import { map, tap } from 'rxjs';

import { mapRealtimeEnum } from '../realtime/enum';
import type { AuthService } from '../services/auth';

export class UserFeature extends Entity {
  // undefined means no user, null means loading
  features$ = new LiveData<FeatureType[] | null | undefined>(null);

  isAdmin$ = this.features$.map(features =>
    features === null ? null : features?.some(f => f === FeatureType.Admin)
  );

  isRevalidating$ = new LiveData(false);
  error$ = new LiveData<any | null>(null);

  constructor(private readonly authService: AuthService) {
    super();
  }

  revalidate = effect(
    map(() => ({
      accountId: this.authService.session.account$.value?.id,
    })),
    exhaustMapSwitchUntilChanged(
      () => false,
      ({ accountId }) => {
        return fromPromise(async () => {
          if (!accountId) {
            return; // no feature if no user
          }

          const account = this.authService.session.account$.value;
          if (account?.id !== accountId) return;
          return {
            userId: account.id,
            features: (account.info?.features ?? []).map(feature =>
              mapRealtimeEnum(FeatureType, feature, 'user feature')
            ),
          };
        }).pipe(
          smartRetry(),
          tap(data => {
            if (data) {
              this.features$.next(data.features);
            } else {
              this.features$.next(null);
            }
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
