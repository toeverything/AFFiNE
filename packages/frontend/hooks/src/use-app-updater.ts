import { isBrowser } from '@affine/env/constant';
import { appSettingAtom } from '@toeverything/infra/atom';
import type { UpdateMeta } from '@toeverything/infra/type';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithObservable, atomWithStorage } from 'jotai/utils';
import { atomEffect } from 'jotai-effect';
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

export const updateAvailableAtom = atomWithObservable(() => {
  return rpcToObservable(null as UpdateMeta | null, {
    event: window.events?.updater.onUpdateAvailable,
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

export const checkingForUpdatesAtom = atom(false);

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

// todo: rethinking where to place this atom effect
const appSettingEffect = atomEffect(get => {
  const settings = get(appSettingAtom);
  // some values in settings should be synced into electron side
  if (environment.isDesktop) {
    window.apis?.updater
      .setConfig({
        autoCheckUpdate: settings.autoCheckUpdate,
        autoDownloadUpdate: settings.autoDownloadUpdate,
      })
      .catch(err => {
        console.error(err);
      });
  }
});

export const useAppUpdater = () => {
  useAtom(appSettingEffect);
  const [appQuitting, setAppQuitting] = useState(false);
  const updateReady = useAtomValue(updateReadyAtom);
  const setSetting = useSetAtom(appSettingAtom);

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

  return {
    quitAndInstall,
    appQuitting,
    checkForUpdates,
    downloadUpdate,
    toggleAutoDownload,
    toggleAutoCheck,
  };
};
