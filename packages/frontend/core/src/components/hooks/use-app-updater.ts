import type { UpdateMeta } from '@affine/electron-api';
import { apis, events } from '@affine/electron-api';
import { track } from '@affine/track';
import { appSettingAtom } from '@toeverything/infra';
import { atom, useAtom, useAtomValue } from 'jotai';
import { atomWithObservable, atomWithStorage } from 'jotai/utils';
import { useCallback, useState } from 'react';
import { Observable } from 'rxjs';

import { popupWindow } from '../../utils';
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
    if (!BUILD_CONFIG.isElectron || !event) {
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
    event: events?.updater.onUpdateReady,
  });
});

// update available, but not downloaded yet
export const updateAvailableAtom = atomWithObservable(() => {
  return rpcToObservable(null as UpdateMeta | null, {
    event: events?.updater.onUpdateAvailable,
  });
});

// downloading new update
export const downloadProgressAtom = atomWithObservable(() => {
  return rpcToObservable(null as number | null, {
    event: events?.updater.onDownloadProgress,
  });
});

export const changelogCheckedAtom = atomWithStorage<Record<string, boolean>>(
  'affine:client-changelog-checked',
  {}
);

export const checkingForUpdatesAtom = atom(false);

export const currentVersionAtom = atom(async () => {
  const currentVersion = await apis?.updater.currentVersion();
  return currentVersion;
});

const currentChangelogUnreadAtom = atom(
  async get => {
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
    track.$.navigationPanel.bottomButtons.quitAndInstall();
    if (updateReady) {
      setAppQuitting(true);
      apis?.updater.quitAndInstall().catch(err => {
        // TODO(@Peng): add error toast here
        console.error(err);
      });
    }
  }, [updateReady]);

  const checkForUpdates = useCallback(async () => {
    track.$.settingsPanel.about.checkUpdates();
    if (checkingForUpdates) {
      return;
    }
    setCheckingForUpdates(true);
    try {
      const updateInfo = await apis?.updater.checkForUpdates();
      return updateInfo?.version ?? false;
    } catch (err) {
      console.error('Error checking for updates:', err);
      return null;
    } finally {
      setCheckingForUpdates(false);
    }
  }, [checkingForUpdates, setCheckingForUpdates]);

  const downloadUpdate = useCallback(() => {
    track.$.settingsPanel.about.downloadUpdate();
    apis?.updater.downloadUpdate().catch(err => {
      console.error('Error downloading update:', err);
    });
  }, []);

  const toggleAutoDownload = useCallback(
    (enable: boolean) => {
      track.$.settingsPanel.about.changeAppSetting({
        key: 'autoDownload',
        value: enable,
      });
      setSetting({
        autoDownloadUpdate: enable,
      });
    },
    [setSetting]
  );

  const toggleAutoCheck = useCallback(
    (enable: boolean) => {
      track.$.settingsPanel.about.changeAppSetting({
        key: 'autoCheckUpdates',
        value: enable,
      });
      setSetting({
        autoCheckUpdate: enable,
      });
    },
    [setSetting]
  );

  const openChangelog = useAsyncCallback(async () => {
    track.$.navigationPanel.bottomButtons.openChangelog();
    popupWindow(BUILD_CONFIG.changelogUrl);
    await setChangelogUnread(true);
  }, [setChangelogUnread]);

  const dismissChangelog = useAsyncCallback(async () => {
    track.$.navigationPanel.bottomButtons.dismissChangelog();
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
    openChangelog,
    dismissChangelog,
    updateReady,
    updateAvailable: useAtomValue(updateAvailableAtom),
    downloadProgress,
    currentVersion: useAtomValue(currentVersionAtom),
  };
};
