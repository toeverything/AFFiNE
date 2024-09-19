import { UserFriendlyError } from '@affine/graphql';
import type { DocMode } from '@blocksuite/affine/blocks';
import {
  effect,
  Entity,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { catchError, EMPTY, mergeMap, switchMap } from 'rxjs';

import type { ShareReaderStore } from '../stores/share-reader';

export class ShareReader extends Entity {
  isLoading$ = new LiveData<boolean>(false);
  error$ = new LiveData<UserFriendlyError | null>(null);
  data$ = new LiveData<{
    workspaceId: string;
    docId: string;
    workspaceBinary: Uint8Array;
    docBinary: Uint8Array;

    // Used for old share server-side mode control
    publishMode?: DocMode;
  } | null>(null);

  constructor(private readonly store: ShareReaderStore) {
    super();
  }

  loadShare = effect(
    switchMap(
      ({ workspaceId, docId }: { workspaceId: string; docId: string }) => {
        return fromPromise(this.store.loadShare(workspaceId, docId)).pipe(
          mergeMap(data => {
            if (!data) {
              this.data$.next(null);
            } else {
              this.data$.next({
                workspaceId,
                docId,
                workspaceBinary: data.workspace,
                docBinary: data.doc,
                publishMode: data.publishMode ?? undefined,
              });
            }
            return EMPTY;
          }),
          catchError((error: any) => {
            this.error$.next(UserFriendlyError.fromAnyError(error));
            return EMPTY;
          }),
          onStart(() => {
            this.isLoading$.next(true);
            this.data$.next(null);
            this.error$.next(null);
          }),
          onComplete(() => {
            this.isLoading$.next(false);
          })
        );
      }
    )
  );
}
