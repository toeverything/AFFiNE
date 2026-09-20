import { RealtimeLiveQuery } from '@affine/core/modules/cloud/realtime/live-query';
import type { WorkspaceService } from '@affine/core/modules/workspace';
import type { RealtimeTopicEventOf } from '@affine/realtime';
import { logger } from '@sentry/react';
import { Entity, LiveData } from '@toeverything/infra';

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

  uploadingAttachments$ = new LiveData<LocalAttachmentFile[]>([]);
  private started = false;
  private readonly liveQuery = new RealtimeLiveQuery<
    Progress,
    RealtimeTopicEventOf<'workspace.embedding.progress.changed'>
  >({
    request: signal => this.requestProgress(signal),
    subscribe: () =>
      this.store.subscribeEmbeddingProgress(this.workspaceService.workspace.id),
    applySnapshot: progress => this.applyProgress(progress),
    applyEvent: event => {
      if (
        typeof event.embedded === 'number' &&
        typeof event.total === 'number'
      ) {
        this.applyProgress({ embedded: event.embedded, total: event.total });
        return 'applied';
      }
      return 'revalidate';
    },
    onError: error => {
      this.error$.setValue(error);
      logger.error('Failed to fetch workspace embedding progress', { error });
    },
  });

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly store: EmbeddingStore
  ) {
    super();
  }

  startEmbeddingProgress() {
    this.started = true;
    this.liveQuery.start();
  }

  stopEmbeddingProgress() {
    this.started = false;
    this.liveQuery.stop();
  }

  getEmbeddingProgress = () => {
    if (this.started) {
      this.liveQuery.revalidate();
      return;
    }
    this.requestProgress(new AbortController().signal).then(
      progress => this.applyProgress(progress),
      error => this.error$.setValue(error)
    );
  };

  override dispose(): void {
    this.liveQuery.dispose();
  }

  private applyProgress(value: Progress | null) {
    this.progress$.next(value);
    if (value && value.embedded === value.total && value.total > 0) {
      this.stopEmbeddingProgress();
    }
  }

  private async requestProgress(signal: AbortSignal) {
    this.loading$.setValue(true);
    try {
      return await this.store.getEmbeddingProgress(
        this.workspaceService.workspace.id,
        signal
      );
    } finally {
      this.loading$.setValue(false);
    }
  }
}
