import { Unreachable } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloseIcon, NewIcon, ResetIcon } from '@blocksuite/icons';
import { useAppUpdater } from '@toeverything/hooks/use-app-updater';
import clsx from 'clsx';
import { useCallback, useMemo } from 'react';

import { Tooltip } from '../../../ui/tooltip';
import * as styles from './index.css';

export interface AddPageButtonPureProps {
  onClickUpdate: () => void;
  onDismissCurrentChangelog: () => void;
  currentChangelogUnread: boolean;
  updateReady: boolean;
  updateAvailable: {
    version: string;
    allowAutoUpdate: boolean;
  } | null;
  autoDownload: boolean;
  downloadProgress: number | null;
  appQuitting: boolean;
  className?: string;
  style?: React.CSSProperties;
}

interface ButtonContentProps {
  updateReady: boolean;
  updateAvailable: {
    version: string;
    allowAutoUpdate: boolean;
  } | null;
  autoDownload: boolean;
  downloadProgress: number | null;
  appQuitting: boolean;
  currentChangelogUnread: boolean;
  onDismissCurrentChangelog: () => void;
}

function DownloadUpdate({ updateAvailable }: ButtonContentProps) {
  const t = useAFFiNEI18N();
  return (
    <div className={styles.installLabel}>
      <span className={styles.ellipsisTextOverflow}>
        {t['com.affine.appUpdater.downloadUpdate']()}
      </span>
      <span className={styles.versionLabel}>{updateAvailable?.version}</span>
    </div>
  );
}

function UpdateReady({ updateAvailable, appQuitting }: ButtonContentProps) {
  const t = useAFFiNEI18N();
  return (
    <div className={styles.updateAvailableWrapper}>
      <div className={styles.installLabelNormal}>
        <span className={styles.ellipsisTextOverflow}>
          {t['com.affine.appUpdater.updateAvailable']()}
        </span>
        <span className={styles.versionLabel}>{updateAvailable?.version}</span>
      </div>

      <div className={styles.installLabelHover}>
        <ResetIcon className={styles.icon} />
        <span className={styles.ellipsisTextOverflow}>
          {t[appQuitting ? 'Loading' : 'com.affine.appUpdater.installUpdate']()}
        </span>
      </div>
    </div>
  );
}

function DownloadingUpdate({
  updateAvailable,
  downloadProgress,
}: ButtonContentProps) {
  const t = useAFFiNEI18N();
  return (
    <div className={clsx([styles.updateAvailableWrapper])}>
      <div className={clsx([styles.installLabelNormal])}>
        <span className={styles.ellipsisTextOverflow}>
          {t['com.affine.appUpdater.downloading']()}
        </span>
        <span className={styles.versionLabel}>{updateAvailable?.version}</span>
      </div>

      <div className={styles.progress}>
        <div
          className={styles.progressInner}
          style={{ width: `${downloadProgress}%` }}
        />
      </div>
    </div>
  );
}

function OpenDownloadPage({ updateAvailable }: ButtonContentProps) {
  const t = useAFFiNEI18N();
  return (
    <>
      <div className={styles.installLabelNormal}>
        <span className={styles.ellipsisTextOverflow}>
          {t['com.affine.appUpdater.updateAvailable']()}
        </span>
        <span className={styles.versionLabel}>{updateAvailable?.version}</span>
      </div>

      <div className={styles.installLabelHover}>
        <span className={styles.ellipsisTextOverflow}>
          {t['com.affine.appUpdater.openDownloadPage']()}
        </span>
      </div>
    </>
  );
}

function WhatsNew({ onDismissCurrentChangelog }: ButtonContentProps) {
  const t = useAFFiNEI18N();
  const onClickClose: React.MouseEventHandler = useCallback(
    e => {
      onDismissCurrentChangelog();
      e.stopPropagation();
    },
    [onDismissCurrentChangelog]
  );
  return (
    <>
      <div className={clsx([styles.whatsNewLabel])}>
        <NewIcon className={styles.icon} />
        <span className={styles.ellipsisTextOverflow}>
          {t['com.affine.appUpdater.whatsNew']()}
        </span>
      </div>
      <div className={styles.closeIcon} onClick={onClickClose}>
        <CloseIcon />
      </div>
    </>
  );
}

const getButtonContentRenderer = (props: ButtonContentProps) => {
  if (props.updateReady) {
    return UpdateReady;
  } else if (props.updateAvailable?.allowAutoUpdate) {
    if (props.autoDownload && props.updateAvailable.allowAutoUpdate) {
      return DownloadingUpdate;
    } else {
      return DownloadUpdate;
    }
  } else if (props.updateAvailable && !props.updateAvailable?.allowAutoUpdate) {
    return OpenDownloadPage;
  } else if (props.currentChangelogUnread) {
    return WhatsNew;
  }
  return null;
};

export function AppUpdaterButtonPure({
  updateReady,
  onClickUpdate,
  onDismissCurrentChangelog,
  currentChangelogUnread,
  updateAvailable,
  autoDownload,
  downloadProgress,
  appQuitting,
  className,
  style,
}: AddPageButtonPureProps) {
  const contentProps = useMemo(
    () => ({
      updateReady,
      updateAvailable,
      currentChangelogUnread,
      autoDownload,
      downloadProgress,
      appQuitting,
      onDismissCurrentChangelog,
    }),
    [
      updateReady,
      updateAvailable,
      currentChangelogUnread,
      autoDownload,
      downloadProgress,
      appQuitting,
      onDismissCurrentChangelog,
    ]
  );

  const ContentComponent = getButtonContentRenderer(contentProps);

  const wrapWithTooltip = (
    node: React.ReactElement,
    tooltip?: React.ReactElement | string
  ) => {
    if (!tooltip) {
      return node;
    }

    return (
      <Tooltip content={tooltip} side="top">
        {node}
      </Tooltip>
    );
  };

  const disabled = useMemo(() => {
    if (appQuitting) {
      return true;
    }

    if (updateAvailable?.allowAutoUpdate) {
      return !updateReady && autoDownload;
    }

    return false;
  }, [
    appQuitting,
    autoDownload,
    updateAvailable?.allowAutoUpdate,
    updateReady,
  ]);

  return wrapWithTooltip(
    <button
      style={style}
      className={clsx([styles.root, className])}
      data-has-update={!!updateAvailable}
      data-updating={appQuitting}
      data-disabled={disabled}
      onClick={onClickUpdate}
    >
      {ContentComponent ? <ContentComponent {...contentProps} /> : null}
      <div className={styles.particles} aria-hidden="true"></div>
      <span className={styles.halo} aria-hidden="true"></span>
    </button>,
    updateAvailable?.version
  );
}

// Although it is called an input, it is actually a button.
export function AppUpdaterButton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const {
    quitAndInstall,
    appQuitting,
    autoDownload,
    downloadUpdate,
    readChangelog,
    changelogUnread,
    updateReady,
    updateAvailable,
    downloadProgress,
    currentVersion,
  } = useAppUpdater();

  const handleClickUpdate = useCallback(() => {
    if (updateReady) {
      quitAndInstall();
    } else if (updateAvailable) {
      if (updateAvailable.allowAutoUpdate) {
        if (autoDownload) {
          // wait for download to finish
        } else {
          downloadUpdate();
        }
      } else {
        window.open(
          `https://github.com/toeverything/AFFiNE/releases/tag/v${currentVersion}`,
          '_blank'
        );
      }
    } else if (changelogUnread) {
      window.open(runtimeConfig.changelogUrl, '_blank');
      readChangelog();
    } else {
      throw new Unreachable();
    }
  }, [
    updateReady,
    updateAvailable,
    changelogUnread,
    quitAndInstall,
    autoDownload,
    downloadUpdate,
    currentVersion,
    readChangelog,
  ]);

  if (!updateAvailable && !changelogUnread) {
    return null;
  }

  return (
    <AppUpdaterButtonPure
      appQuitting={appQuitting}
      autoDownload={autoDownload}
      updateReady={!!updateReady}
      onClickUpdate={handleClickUpdate}
      onDismissCurrentChangelog={readChangelog}
      currentChangelogUnread={changelogUnread}
      updateAvailable={updateAvailable}
      downloadProgress={downloadProgress}
      className={className}
      style={style}
    />
  );
}
