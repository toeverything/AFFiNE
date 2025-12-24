import type { WorkspaceService } from '@affine/core/modules/workspace';
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
import type { IgnoredDoc } from '../types';
import { logger } from '../utils';

export class IgnoredDocs extends Entity {
  docs$ = new LiveData<IgnoredDoc[]>([]);
  error$ = new LiveData<any>(null);
  loading$ = new LiveData(true);

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly store: EmbeddingStore
  ) {
    super();
  }

  getIgnoredDocs = effect(
    exhaustMap(() => {
      return fromPromise(signal =>
        this.store.getIgnoredDocs(this.workspaceService.workspace.id, signal)
      ).pipe(
        smartRetry(),
        mergeMap(value => {
          this.docs$.next(value);
          return EMPTY;
        }),
        catchErrorInto(this.error$, error => {
          logger.error(
            'Failed to fetch workspace doc embedding ignored docs',
            error
          );
        }),
        onStart(() => this.loading$.setValue(true)),
        onComplete(() => this.loading$.setValue(false))
      );
    })
  );

  updateIgnoredDocs = ({
    add,
    remove,
  }: {
    add: string[];
    remove: string[];
  }) => {
    return this.store
      .updateIgnoredDocs(this.workspaceService.workspace.id, add, remove)
      .then(() => {
        this.getIgnoredDocs();
      });
  };

  override dispose(): void {
    this.getIgnoredDocs.unsubscribe();
  }
}
