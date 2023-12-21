import { isBrowser } from '@affine/env/constant';
import { appSettingAtom } from '@toeverything/infra/atom';
import type { UpdateMeta } from '@toeverything/infra/type';
import { atom, useAtom, useAtomValue } from 'jotai';
import { atomWithObservable, atomWithStorage } from 'jotai/utils';
import { useCallback, useState } from 'react';
import { Observable } from 'rxjs';

import { useAsyncCallback } from './affine-async-hooks';

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

// download complete, ready to install
export const updateReadyAtom = atomWithObservable(() => {
  return rpcToObservable(null as UpdateMeta | null, {
    event: window.events?.updater.onUpdateReady,
  });
});

// update available, but not downloaded yet
export const updateAvailableAtom = atomWithObservable(() => {
  return rpcToObservable(null as UpdateMeta | null, {
    event: window.events?.updater.onUpdateAvailable,
  });
});

// downloading new update
export const downloadProgressAtom = atomWithObservable(() => {
  return rpcToObservable(null as number | null, {
    event: window.events?.updater.onDownloadProgress,
  });
});

export const changelogCheckedAtom = atomWithStorage<Record<string, boolean>>(
  'affine:client-changelog-checked',
  {}
);

export const checkingForUpdatesAtom = atom(false);

export const currentVersionAtom = atom(async () => {
  if (!isBrowser) {
    return null;
  }
  const currentVersion = await window.apis?.updater.currentVersion();
  return currentVersion;
});

const currentChangelogUnreadAtom = atom(
  async get => {
    if (!isBrowser) {
      return false;
    }
    const mapping = get(changelogCheckedAtom);
    const currentVersion = await get(currentVersionAtom);
    if (currentVersion) {
      return !mapping[currentVersion];
    }
    return false;
  },
  async (get, set, v: boolean) => {
    const currentVersion = await get(currentVersionAtom);
    if (currentVersion) {
      set(changelogCheckedAtom, mapping => {
        return {
          ...mapping,
          [currentVersion]: v,
        };
      });
    }
  }
);

export const useAppUpdater = () => {
  const [appQuitting, setAppQuitting] = useState(false);
  const updateReady = useAtomValue(updateReadyAtom);
  const [setting, setSetting] = useAtom(appSettingAtom);
  const downloadProgress = useAtomValue(downloadProgressAtom);
  const [changelogUnread, setChangelogUnread] = useAtom(
    currentChangelogUnreadAtom
  );

  const [checkingForUpdates, setCheckingForUpdates] = useAtom(
    checkingForUpdatesAtom
  );

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
    if (checkingForUpdates) {
      return;
    }
    setCheckingForUpdates(true);
    try {
      const updateInfo = await window.apis?.updater.checkForUpdates();
      return updateInfo?.version ?? false;
    } catch (err) {
      console.error('Error checking for updates:', err);
      return null;
    } finally {
      setCheckingForUpdates(false);
    }
  }, [checkingForUpdates, setCheckingForUpdates]);

  const downloadUpdate = useCallback(() => {
    window.apis?.updater.downloadUpdate().catch(err => {
      console.error('Error downloading update:', err);
    });
  }, []);

  const toggleAutoDownload = useCallback(
    (enable: boolean) => {
      setSetting({
        autoDownloadUpdate: enable,
      });
    },
    [setSetting]
  );

  const toggleAutoCheck = useCallback(
    (enable: boolean) => {
      setSetting({
        autoCheckUpdate: enable,
      });
    },
    [setSetting]
  );

  const readChangelog = useAsyncCallback(async () => {
    await setChangelogUnread(true);
  }, [setChangelogUnread]);

  return {
    quitAndInstall,
    checkForUpdates,
    downloadUpdate,
    toggleAutoDownload,
    toggleAutoCheck,
    appQuitting,
    checkingForUpdates,
    autoCheck: setting.autoCheckUpdate,
    autoDownload: setting.autoDownloadUpdate,
    changelogUnread,
    readChangelog,
    updateReady,
    updateAvailable: useAtomValue(updateAvailableAtom),
    downloadProgress,
    currentVersion: useAtomValue(currentVersionAtom),
  };
};
