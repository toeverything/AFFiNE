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
import { EMPTY, mergeMap, switchMap } from 'rxjs';

import { isBackendError, isNetworkError } from '../../cloud';
import type { TemplateDownloaderStore } from '../store/downloader';

export class TemplateDownloader extends Entity {
  constructor(private readonly store: TemplateDownloaderStore) {
    super();
  }

  readonly isDownloading$ = new LiveData<boolean>(false);
  readonly data$ = new LiveData<Uint8Array | null>(null);
  readonly error$ = new LiveData<any | null>(null);

  readonly download = effect(
    switchMap(({ snapshotUrl }: { snapshotUrl: string }) => {
      return fromPromise(() => this.store.download(snapshotUrl)).pipe(
        mergeMap(({ data }) => {
          this.data$.next(data);
          return EMPTY;
        }),
        backoffRetry({
          when: isNetworkError,
          count: Infinity,
        }),
        backoffRetry({
          when: isBackendError,
        }),
        catchErrorInto(this.error$),
        onStart(() => {
          this.isDownloading$.next(true);
          this.data$.next(null);
          this.error$.next(null);
        }),
        onComplete(() => this.isDownloading$.next(false))
      );
    })
  );
}
