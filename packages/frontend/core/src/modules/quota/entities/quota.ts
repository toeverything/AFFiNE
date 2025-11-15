import { DebugLogger } from '@affine/debug';
import type { WorkspaceQuotaQuery } from '@affine/graphql';
import {
  catchErrorInto,
  effect,
  Entity,
  exhaustMapWithTrailing,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  smartRetry,
} from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import bytes from 'bytes';
import { tap } from 'rxjs';

import type { WorkspaceService } from '../../workspace';
import type { WorkspaceQuotaStore } from '../stores/quota';

type QuotaType = WorkspaceQuotaQuery['workspace']['quota'];

const logger = new DebugLogger('affine:workspace-permission');

export class WorkspaceQuota extends Entity {
  quota$ = new LiveData<QuotaType | null>(null);
  isRevalidating$ = new LiveData(false);
  error$ = new LiveData<any>(null);

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
        ? cssVarV2('status/error')
        : cssVarV2('toast/iconState/regular')
      : null
  );

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly store: WorkspaceQuotaStore
  ) {
    super();
  }

  revalidate = effect(
    exhaustMapWithTrailing(() => {
      return fromPromise(async signal => {
        const data = await this.store.fetchWorkspaceQuota(
          this.workspaceService.workspace.id,
          signal
        );
        return { quota: data, used: data.usedStorageQuota };
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
        catchErrorInto(this.error$, error => {
          logger.error('Failed to fetch workspace quota', error);
        }),
        onStart(() => this.isRevalidating$.setValue(true)),
        onComplete(() => this.isRevalidating$.setValue(false))
      );
    })
  );

  waitForRevalidation(signal?: AbortSignal) {
    this.revalidate();
    return this.isRevalidating$.waitFor(
      isRevalidating => !isRevalidating,
      signal
    );
  }

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
