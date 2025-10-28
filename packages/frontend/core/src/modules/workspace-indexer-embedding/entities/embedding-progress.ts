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
import { EMPTY, interval, Subject } from 'rxjs';
import { exhaustMap, mergeMap, switchMap, takeUntil } from 'rxjs/operators';

import type { EmbeddingStore } from '../stores/embedding';
import type { LocalAttachmentFile } from '../types';

interface Progress {
  embedded: number;
  total: number;
}

export class EmbeddingProgress extends Entity {
  progress$ = new LiveData<Progress | null>(null);
  error$ = new LiveData<any>(null);
  loading$ = new LiveData(true);

  private readonly EMBEDDING_PROGRESS_POLL_INTERVAL = 3000;
  private readonly stopEmbeddingProgress$ = new Subject<void>();
  uploadingAttachments$ = new LiveData<LocalAttachmentFile[]>([]);

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly store: EmbeddingStore
  ) {
    super();
  }

  startEmbeddingProgressPolling() {
    this.stopEmbeddingProgressPolling();
    this.getEmbeddingProgress();
  }

  stopEmbeddingProgressPolling() {
    this.stopEmbeddingProgress$.next();
  }

  getEmbeddingProgress = effect(
    exhaustMap(() => {
      return interval(this.EMBEDDING_PROGRESS_POLL_INTERVAL).pipe(
        takeUntil(this.stopEmbeddingProgress$),
        switchMap(() =>
          fromPromise(signal =>
            this.store.getEmbeddingProgress(
              this.workspaceService.workspace.id,
              signal
            )
          ).pipe(
            smartRetry(),
            mergeMap(value => {
              this.progress$.next(value);
              if (value && value.embedded === value.total && value.total > 0) {
                this.stopEmbeddingProgressPolling();
              }
              return EMPTY;
            }),
            catchErrorInto(this.error$, error => {
              logger.error(
                'Failed to fetch workspace embedding progress',
                error
              );
            }),
            onStart(() => this.loading$.setValue(true)),
            onComplete(() => this.loading$.setValue(false))
          )
        )
      );
    })
  );

  override dispose(): void {
    this.stopEmbeddingProgress$.next();
    this.getEmbeddingProgress.unsubscribe();
  }
}
