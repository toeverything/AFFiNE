import { useAppUpdater } from '@affine/core/hooks/use-app-updater';

import { AppUpdaterButton } from '../app-sidebar';

export const UpdaterButton = () => {
  const appUpdater = useAppUpdater();

  return (
    <AppUpdaterButton
      onQuitAndInstall={appUpdater.quitAndInstall}
      onDownloadUpdate={appUpdater.downloadUpdate}
      onDismissChangelog={appUpdater.dismissChangelog}
      onOpenChangelog={appUpdater.openChangelog}
      changelogUnread={appUpdater.changelogUnread}
      updateReady={!!appUpdater.updateReady}
      updateAvailable={appUpdater.updateAvailable}
      autoDownload={appUpdater.autoDownload}
      downloadProgress={appUpdater.downloadProgress}
      appQuitting={appUpdater.appQuitting}
    />
  );
};
