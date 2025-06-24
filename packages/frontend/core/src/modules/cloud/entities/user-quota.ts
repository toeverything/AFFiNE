import type { QuotaQuery } from '@affine/graphql';
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
import { cssVarV2 } from '@toeverything/theme/v2';
import bytes from 'bytes';
import { map, tap } from 'rxjs';

import type { AuthService } from '../services/auth';
import type { UserQuotaStore } from '../stores/user-quota';

export class UserQuota extends Entity {
  quota$ = new LiveData<NonNullable<QuotaQuery['currentUser']>['quota'] | null>(
    null
  );
  /** Used storage in bytes */
  used$ = new LiveData<number | null>(null);
  /** Formatted used storage */
  usedFormatted$ = this.used$.map(used =>
    used !== null ? bytes.format(used) : null
  );
  /** Maximum storage limit in bytes */
  max$ = this.quota$.map(quota => (quota ? quota.storageQuota : null));
  /** Maximum storage limit formatted */
  maxFormatted$ = this.max$.map(max => (max ? bytes.format(max) : null));

  /** Percentage of storage used */
  percent$ = LiveData.computed(get => {
    const max = get(this.max$);
    const used = get(this.used$);
    if (max === null || used === null) {
      return null;
    }
    return Math.min(
      100,
      Math.max(0.5, Number(((used / max) * 100).toFixed(4)))
    );
  });

  color$ = this.percent$.map(percent =>
    percent !== null
      ? percent > 80
        ? cssVarV2('toast/iconState/error')
        : cssVarV2('toast/iconState/regular')
      : null
  );

  isRevalidating$ = new LiveData(false);
  error$ = new LiveData<any | null>(null);

  constructor(
    private readonly authService: AuthService,
    private readonly store: UserQuotaStore
  ) {
    super();
  }

  revalidate = effect(
    map(() => ({
      accountId: this.authService.session.account$.value?.id,
    })),
    exhaustMapSwitchUntilChanged(
      (a, b) => a.accountId === b.accountId,
      ({ accountId }) =>
        fromPromise(async signal => {
          if (!accountId) {
            return; // no quota if no user
          }
          const { quota, used } = await this.store.fetchUserQuota(signal);

          return { quota, used };
        }).pipe(
          smartRetry(),
          tap(data => {
            if (data) {
              const { quota, used } = data;
              this.quota$.next(quota);
              this.used$.next(used);
            } else {
              this.quota$.next(null);
              this.used$.next(null);
            }
          }),
          catchErrorInto(this.error$),
          onStart(() => this.isRevalidating$.next(true)),
          onComplete(() => this.isRevalidating$.next(false))
        ),
      () => {
        // Reset the state when the user is changed
        this.reset();
      }
    )
  );

  reset() {
    this.quota$.next(null);
    this.used$.next(null);
    this.error$.next(null);
    this.isRevalidating$.next(false);
  }

  override dispose(): void {
    this.revalidate.unsubscribe();
  }
}
