import { isBrowser } from '@affine/env/constant';
import type { UpdateMeta } from '@toeverything/infra/type';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithObservable, atomWithStorage } from 'jotai/utils';
import { useCallback, useState } from 'react';
import { Observable } from 'rxjs';

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

export const updateAvailableStateAtom = atom<UpdateMeta | null>(null);

export const updateAvailableAtom = atomWithObservable(get => {
  return rpcToObservable(get(updateAvailableStateAtom), {
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

export const currentVersionAtom = atom(async () => {
  if (!isBrowser) {
    return null;
  }
  const currentVersion = await window.apis?.updater.currentVersion();
  return currentVersion;
});

export const currentChangelogUnreadAtom = atom(async get => {
  if (!isBrowser) {
    return false;
  }
  const mapping = get(changelogCheckedAtom);
  const currentVersion = await get(currentVersionAtom);
  if (currentVersion) {
    return !mapping[currentVersion];
  }
  return false;
});

export const isCheckingForUpdatesAtom = atom(false);
export const isAutoDownloadUpdateAtom = atom(true);
export const isAutoCheckUpdateAtom = atom(true);

export const useAppUpdater = () => {
  const [appQuitting, setAppQuitting] = useState(false);
  const updateReady = useAtomValue(updateReadyAtom);
  const setUpdateAvailableState = useSetAtom(updateAvailableStateAtom);
  const setIsCheckingForUpdates = useSetAtom(isCheckingForUpdatesAtom);
  const setIsAutoCheckUpdate = useSetAtom(isAutoCheckUpdateAtom);
  const setIsAutoDownloadUpdate = useSetAtom(isAutoDownloadUpdateAtom);

  const quitAndInstall = useCallback(() => {
    if (updateReady) {
      setAppQuitting(true);
      window.apis?.updater.quitAndInstall().catch(err => {
        // TODO: add error toast here
        console.error(err);
      });
    }
  }, [updateReady]);

  const checkForUpdates = useCallback(async () => {
    setIsCheckingForUpdates(true);
    try {
      const updateInfo = await window.apis?.updater.checkForUpdatesAndNotify();
      setIsCheckingForUpdates(false);
      if (updateInfo) {
        const updateMeta: UpdateMeta = {
          version: updateInfo.version,
          allowAutoUpdate: false,
        };
        setUpdateAvailableState(updateMeta);
        return updateInfo.version;
      }
      return false;
    } catch (err) {
      setIsCheckingForUpdates(false);
      console.error('Error checking for updates:', err);
      return null;
    }
  }, [setIsCheckingForUpdates, setUpdateAvailableState]);

  const downloadUpdate = useCallback(() => {
    window.apis?.updater
      .downloadUpdate()
      .then(() => {})
      .catch(err => {
        console.error('Error downloading update:', err);
      });
  }, []);

  const toggleAutoDownload = useCallback(
    (enable: boolean) => {
      window.apis?.updater
        .setConfig([
          {
            autoDownloadUpdate: enable,
          },
        ])
        .then(() => {
          setIsAutoDownloadUpdate(enable);
        })
        .catch(err => {
          console.error('Error setting auto download:', err);
        });
    },
    [setIsAutoDownloadUpdate]
  );

  const toggleAutoCheck = useCallback(
    (enable: boolean) => {
      window.apis?.updater
        .setConfig([
          {
            autoCheckUpdate: enable,
          },
        ])
        .then(() => {
          setIsAutoCheckUpdate(enable);
        })
        .catch(err => {
          console.error('Error setting auto check:', err);
        });
    },
    [setIsAutoCheckUpdate]
  );

  return {
    quitAndInstall,
    appQuitting,
    checkForUpdates,
    downloadUpdate,
    toggleAutoDownload,
    toggleAutoCheck,
  };
};
