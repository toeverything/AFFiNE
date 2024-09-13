import { Loading } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useAppUpdater } from '@affine/core/components/hooks/use-app-updater';
import { useI18n } from '@affine/i18n';
import clsx from 'clsx';
import { useCallback, useMemo, useState } from 'react';

import * as styles from './style.css';

enum CheckUpdateStatus {
  UNCHECK = 'uncheck',
  LATEST = 'latest',
  UPDATE_AVAILABLE = 'update-available',
  ERROR = 'error',
}

const useUpdateStatusLabels = (checkUpdateStatus: CheckUpdateStatus) => {
  const t = useI18n();
  const { updateAvailable, downloadProgress, updateReady, checkingForUpdates } =
    useAppUpdater();

  const buttonLabel = useMemo(() => {
    if (updateReady) {
      return t['com.affine.aboutAFFiNE.checkUpdate.button.restart']();
    }
    if (updateAvailable && downloadProgress === null) {
      return t['com.affine.aboutAFFiNE.checkUpdate.button.download']();
    }
    if (
      checkUpdateStatus === CheckUpdateStatus.LATEST ||
      checkUpdateStatus === CheckUpdateStatus.ERROR
    ) {
      return t['com.affine.aboutAFFiNE.checkUpdate.button.retry']();
    }
    return t['com.affine.aboutAFFiNE.checkUpdate.button.check']();
  }, [checkUpdateStatus, downloadProgress, t, updateAvailable, updateReady]);

  const subtitleLabel = useMemo(() => {
    if (updateReady) {
      return t['com.affine.aboutAFFiNE.checkUpdate.subtitle.restart']();
    } else if (updateAvailable && downloadProgress === null) {
      return t['com.affine.aboutAFFiNE.checkUpdate.subtitle.update-available']({
        version: updateAvailable.version,
      });
    } else if (checkingForUpdates) {
      return t['com.affine.aboutAFFiNE.checkUpdate.subtitle.checking']();
    } else if (updateAvailable && downloadProgress !== null) {
      return t['com.affine.aboutAFFiNE.checkUpdate.subtitle.downloading']();
    } else if (checkUpdateStatus === CheckUpdateStatus.ERROR) {
      return t['com.affine.aboutAFFiNE.checkUpdate.subtitle.error']();
    } else if (checkUpdateStatus === CheckUpdateStatus.LATEST) {
      return t['com.affine.aboutAFFiNE.checkUpdate.subtitle.latest']();
    }
    return t['com.affine.aboutAFFiNE.checkUpdate.subtitle.check']();
  }, [
    checkUpdateStatus,
    downloadProgress,
    checkingForUpdates,
    t,
    updateAvailable,
    updateReady,
  ]);

  const subtitle = useMemo(() => {
    return (
      <span
        className={clsx(styles.checkUpdateDesc, {
          active:
            updateReady ||
            (updateAvailable && downloadProgress === null) ||
            checkUpdateStatus === CheckUpdateStatus.LATEST,
          error: checkUpdateStatus === CheckUpdateStatus.ERROR,
        })}
      >
        {checkingForUpdates ? <Loading size={14} /> : null}
        {subtitleLabel}
      </span>
    );
  }, [
    checkUpdateStatus,
    downloadProgress,
    checkingForUpdates,
    subtitleLabel,
    updateAvailable,
    updateReady,
  ]);

  return { subtitle, buttonLabel };
};

export const UpdateCheckSection = () => {
  const t = useI18n();
  const {
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    updateAvailable,
    downloadProgress,
    updateReady,
  } = useAppUpdater();
  const [checkUpdateStatus, setCheckUpdateStatus] = useState<CheckUpdateStatus>(
    CheckUpdateStatus.UNCHECK
  );

  const { buttonLabel, subtitle } = useUpdateStatusLabels(checkUpdateStatus);

  const asyncCheckForUpdates = useAsyncCallback(async () => {
    let statusCheck = CheckUpdateStatus.UNCHECK;
    try {
      const status = await checkForUpdates();

      if (status === null) {
        statusCheck = CheckUpdateStatus.ERROR;
      } else if (status === false) {
        statusCheck = CheckUpdateStatus.LATEST;
      } else if (typeof status === 'string') {
        statusCheck = CheckUpdateStatus.UPDATE_AVAILABLE;
      }
    } catch (e) {
      console.error(e);
      statusCheck = CheckUpdateStatus.ERROR;
    } finally {
      setCheckUpdateStatus(statusCheck);
    }
  }, [checkForUpdates]);

  const handleClick = useCallback(() => {
    if (updateAvailable && downloadProgress === null) {
      return downloadUpdate();
    }
    if (updateReady) {
      return quitAndInstall();
    }
    asyncCheckForUpdates();
  }, [
    asyncCheckForUpdates,
    downloadProgress,
    downloadUpdate,
    quitAndInstall,
    updateAvailable,
    updateReady,
  ]);

  return (
    <SettingRow
      name={t['com.affine.aboutAFFiNE.checkUpdate.title']()}
      desc={subtitle}
    >
      <Button
        data-testid="check-update-button"
        onClick={handleClick}
        disabled={downloadProgress !== null && !updateReady}
      >
        {buttonLabel}
      </Button>
    </SettingRow>
  );
};
