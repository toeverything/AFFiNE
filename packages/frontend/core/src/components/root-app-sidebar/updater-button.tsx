import { useAppUpdater } from '@affine/core/components/hooks/use-app-updater';
import { Suspense } from 'react';

import { AppUpdaterButton } from '../app-sidebar';

const UpdaterButtonInner = () => {
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

export const UpdaterButton = () => {
  return (
    <Suspense>
      <UpdaterButtonInner />
    </Suspense>
  );
};
