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

export const isAutoDownloadUpdateAtom = atom(async () => {
  try {
    const res = await window.apis?.updater.autoDownloadUpdate();
    return res;
  } catch (err) {
    console.error(err);
    return true;
  }
});

export const isAutoCheckUpdateAtom = atom(async () => {
  try {
    const res = await window.apis?.updater.autoCheckUpdate();
    return res;
  } catch (err) {
    console.error(err);
    return true;
  }
});

export const useAppUpdater = () => {
  const [appQuitting, setAppQuitting] = useState(false);
  const updateReady = useAtomValue(updateReadyAtom);
  const setUpdateAvailableState = useSetAtom(updateAvailableStateAtom);
  const setIsCheckingForUpdates = useSetAtom(isCheckingForUpdatesAtom);

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

  const toggleAutoDownload = useCallback((enable: boolean) => {
    if (enable) {
      window.apis?.updater.enableAutoDownloadUpdate().catch(err => {
        console.error('Error enabling auto update:', err);
      });
    } else {
      window.apis?.updater.disableAutoDownloadUpdate().catch(err => {
        console.error('Error disabling auto update:', err);
      });
    }
  }, []);

  const toggleAutoCheck = useCallback((enable: boolean) => {
    if (enable) {
      window.apis?.updater.enableAutoCheckUpdate().catch(err => {
        console.error('Error enabling auto update:', err);
      });
    } else {
      window.apis?.updater.disableAutoCheckUpdate().catch(err => {
        console.error('Error disabling auto update:', err);
      });
    }
  }, []);

  return {
    quitAndInstall,
    appQuitting,
    checkForUpdates,
    downloadUpdate,
    toggleAutoDownload,
    toggleAutoCheck,
  };
};
