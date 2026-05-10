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
import { EMPTY, type Subscription } from 'rxjs';
import { exhaustMap, mergeMap } from 'rxjs/operators';

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

  private progressSubscription?: Subscription;
  uploadingAttachments$ = new LiveData<LocalAttachmentFile[]>([]);

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly store: EmbeddingStore
  ) {
    super();
  }

  startEmbeddingProgress() {
    this.stopEmbeddingProgress();
    this.progressSubscription = this.store
      .subscribeEmbeddingProgress(this.workspaceService.workspace.id)
      .subscribe({
        next: () => this.getEmbeddingProgress(),
        error: error => this.error$.setValue(error),
      });
    this.getEmbeddingProgress();
  }

  stopEmbeddingProgress() {
    this.progressSubscription?.unsubscribe();
    this.progressSubscription = undefined;
  }

  getEmbeddingProgress = effect(
    exhaustMap(() => {
      return fromPromise(signal =>
        this.store.getEmbeddingProgress(
          this.workspaceService.workspace.id,
          signal
        )
      ).pipe(
        smartRetry(),
        mergeMap(value => {
          this.progress$.next(value);
          if (value && value.embedded === value.total && value.total > 0) {
            this.stopEmbeddingProgress();
          }
          return EMPTY;
        }),
        catchErrorInto(this.error$, error => {
          logger.error('Failed to fetch workspace embedding progress', error);
        }),
        onStart(() => this.loading$.setValue(true)),
        onComplete(() => this.loading$.setValue(false))
      );
    })
  );

  override dispose(): void {
    this.progressSubscription?.unsubscribe();
    this.getEmbeddingProgress.unsubscribe();
  }
}
