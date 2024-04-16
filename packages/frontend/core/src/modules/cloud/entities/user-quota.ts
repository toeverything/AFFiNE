import type { QuotaQuery } from '@affine/graphql';
import {
  backoffRetry,
  catchErrorInto,
  effect,
  Entity,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import bytes from 'bytes';
import { EMPTY, exhaustMap, mergeMap } from 'rxjs';

import { isBackendError, isNetworkError } from '../error';
import type { UserQuotaStoreService } from '../services/user-quota-store';

export class UserQuota extends Entity {
  quota$ = new LiveData<NonNullable<QuotaQuery['currentUser']>['quota']>(null);
  /** Used storage in bytes */
  used$ = new LiveData<number | null>(null);
  /** Formatted used storage */
  usedFormatted$ = this.used$.map(used => (used ? bytes.format(used) : null));
  /** Maximum storage limit in bytes */
  max$ = this.quota$.map(quota => (quota ? quota.storageQuota : null));
  /** Maximum storage limit formatted */
  maxFormatted$ = this.max$.map(max => (max ? bytes.format(max) : null));

  aiActionLimit$ = new LiveData<number | 'unlimited' | null>(null);
  aiActionUsed$ = new LiveData<number | null>(null);

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
        ? cssVar('errorColor')
        : cssVar('processingColor')
      : null
  );

  isRevalidating$ = new LiveData(false);
  error$ = new LiveData<any | null>(null);

  constructor(private readonly store: UserQuotaStoreService) {
    super();
  }

  revalidate = effect(
    exhaustMap(() =>
      fromPromise(async signal => {
        const { quota, aiQuota, used } =
          await this.store.fetchUserQuota(signal);

        return { quota, aiQuota, used };
      }).pipe(
        backoffRetry({
          when: isNetworkError,
          count: Infinity,
        }),
        backoffRetry({
          when: isBackendError,
        }),
        mergeMap(({ quota, aiQuota, used }) => {
          this.quota$.next(quota);
          this.used$.next(used);
          this.aiActionUsed$.next(aiQuota.used);
          this.aiActionLimit$.next(aiQuota.limit); // fix me: unlimited status
          return EMPTY;
        }),
        catchErrorInto(this.error$),
        onStart(() => this.isRevalidating$.next(true)),
        onComplete(() => this.isRevalidating$.next(false))
      )
    )
  );

  override dispose(): void {
    this.revalidate.unsubscribe();
  }
}
