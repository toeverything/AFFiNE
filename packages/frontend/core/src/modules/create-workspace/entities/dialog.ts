import { Entity, LiveData } from '@toeverything/infra';

import type { CreateWorkspaceCallbackPayload } from '../types';

export class CreateWorkspaceDialog extends Entity {
  readonly mode$ = new LiveData<'new' | 'add'>('new');
  readonly isOpen$ = new LiveData(false);
  readonly callback$ = new LiveData<
    (data: CreateWorkspaceCallbackPayload | undefined) => void
  >(() => {});

  open(
    mode: 'new' | 'add',
    callback?: (data: CreateWorkspaceCallbackPayload | undefined) => void
  ) {
    this.callback(undefined);
    this.mode$.next(mode);
    this.isOpen$.next(true);
    if (callback) {
      this.callback$.next(callback);
    }
  }

  callback(payload: CreateWorkspaceCallbackPayload | undefined) {
    this.callback$.value(payload);
    this.callback$.next(() => {});
  }

  close() {
    this.isOpen$.next(false);
    this.callback(undefined);
  }
}
