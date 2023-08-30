import { isBrowser } from '@affine/env/constant';
import type { UpdateMeta } from '@toeverything/infra';
import { atomWithObservable, atomWithStorage } from 'jotai/utils';
import { Observable } from 'rxjs';

// todo: move to utils?
function rpcToObservable<
  T,
  H extends () => Promise<T>,
  E extends (callback: (t: T) => void) => () => void,
>(
  initialValue: T | null,
  {
    event,
    handler,
    onSubscribe,
  }: {
    event?: E;
    handler?: H;
    onSubscribe?: () => void;
  }
): Observable<T | null> {
  return new Observable<T | null>(subscriber => {
    subscriber.next(initialValue);
    onSubscribe?.();
    if (!isBrowser || !environment.isDesktop || !event) {
      subscriber.complete();
      return;
    }
    handler?.()
      .then(t => {
        subscriber.next(t);
      })
      .catch(err => {
        subscriber.error(err);
      });
    return event(t => {
      subscriber.next(t);
    });
  });
}

export const updateReadyAtom = atomWithObservable(() => {
  return rpcToObservable(null as UpdateMeta | null, {
    event: window.events?.updater.onUpdateReady,
  });
});

export const updateAvailableAtom = atomWithObservable(() => {
  return rpcToObservable(null as UpdateMeta | null, {
    event: window.events?.updater.onUpdateAvailable,
    onSubscribe: () => {
      window.apis?.updater.checkForUpdatesAndNotify().catch(err => {
        console.error(err);
      });
    },
  });
});

export const downloadProgressAtom = atomWithObservable(() => {
  return rpcToObservable(null as number | null, {
    event: window.events?.updater.onDownloadProgress,
  });
});

export const changelogCheckedAtom = atomWithStorage<Record<string, boolean>>(
  'affine:client-changelog-checked',
  {}
);
