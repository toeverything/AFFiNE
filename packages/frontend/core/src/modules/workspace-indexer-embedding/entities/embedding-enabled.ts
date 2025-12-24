import type { WorkspaceService } from '@affine/core/modules/workspace';
import { logger } from '@sentry/react';
import {
  catchErrorInto,
  effect,
  Entity,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  smartRetry,
} from '@toeverything/infra';
import { EMPTY } from 'rxjs';
import { exhaustMap, mergeMap } from 'rxjs/operators';

import type { EmbeddingStore } from '../stores/embedding';

export class EmbeddingEnabled extends Entity {
  enabled$ = new LiveData<boolean | null>(null);
  loading$ = new LiveData(true);
  error$ = new LiveData<any>(null);

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly store: EmbeddingStore
  ) {
    super();
  }

  getEnabled = effect(
    exhaustMap(() => {
      return fromPromise(signal =>
        this.store.getEnabled(this.workspaceService.workspace.id, signal)
      ).pipe(
        smartRetry(),
        mergeMap(value => {
          this.enabled$.next(value);
          return EMPTY;
        }),
        catchErrorInto(this.error$, error => {
          logger.error(
            'Failed to fetch workspace doc embedding enabled',
            error
          );
        }),
        onStart(() => this.loading$.setValue(true)),
        onComplete(() => this.loading$.setValue(false))
      );
    })
  );

  setEnabled = (enabled: boolean) => {
    return this.store
      .updateEnabled(this.workspaceService.workspace.id, enabled)
      .then(() => {
        this.getEnabled();
      });
  };

  override dispose(): void {
    this.getEnabled.unsubscribe();
  }
}
