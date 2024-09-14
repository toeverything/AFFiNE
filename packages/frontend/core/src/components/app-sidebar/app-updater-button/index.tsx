import { Tooltip } from '@affine/component';
import { useCatchEventCallback } from '@affine/core/components/hooks/use-catch-event-hook';
import { popupWindow } from '@affine/core/utils';
import { Unreachable } from '@affine/env/constant';
import { useI18n } from '@affine/i18n';
import { CloseIcon, NewIcon, ResetIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { useCallback, useMemo } from 'react';

import * as styles from './index.css';

export interface AddPageButtonProps {
  onQuitAndInstall: () => void;
  onDownloadUpdate: () => void;
  onDismissChangelog: () => void;
  onOpenChangelog: () => void;
  changelogUnread: boolean;
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
  changelogUnread: boolean;
  onDismissChangelog: () => void;
}

function DownloadUpdate({ updateAvailable }: ButtonContentProps) {
  const t = useI18n();
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
  const t = useI18n();
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
  const t = useI18n();
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
  const t = useI18n();
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

function WhatsNew({ onDismissChangelog }: ButtonContentProps) {
  const t = useI18n();
  const onClickClose = useCatchEventCallback(() => {
    onDismissChangelog();
  }, [onDismissChangelog]);
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
  } else if (props.changelogUnread) {
    return WhatsNew;
  }
  return null;
};

export function AppUpdaterButton({
  updateReady,
  changelogUnread,
  onDismissChangelog,
  onDownloadUpdate,
  onQuitAndInstall,
  onOpenChangelog,
  updateAvailable,
  autoDownload,
  downloadProgress,
  appQuitting,
  className,
  style,
}: AddPageButtonProps) {
  const handleClick = useCallback(() => {
    if (updateReady) {
      onQuitAndInstall();
    } else if (updateAvailable) {
      if (updateAvailable.allowAutoUpdate) {
        if (autoDownload) {
          // wait for download to finish
        } else {
          onDownloadUpdate();
        }
      } else {
        popupWindow(
          `https://github.com/toeverything/AFFiNE/releases/tag/v${updateAvailable.version}`
        );
      }
    } else if (changelogUnread) {
      onOpenChangelog();
    } else {
      throw new Unreachable();
    }
  }, [
    updateReady,
    updateAvailable,
    changelogUnread,
    onQuitAndInstall,
    autoDownload,
    onDownloadUpdate,
    onOpenChangelog,
  ]);

  const contentProps = useMemo(
    () => ({
      updateReady,
      updateAvailable,
      changelogUnread,
      autoDownload,
      downloadProgress,
      appQuitting,
      onDismissChangelog,
    }),
    [
      updateReady,
      updateAvailable,
      changelogUnread,
      autoDownload,
      downloadProgress,
      appQuitting,
      onDismissChangelog,
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

  if (!updateAvailable && !changelogUnread) {
    return null;
  }

  return wrapWithTooltip(
    <button
      style={style}
      className={clsx([styles.root, className])}
      data-has-update={!!updateAvailable}
      data-updating={appQuitting}
      data-disabled={disabled}
      onClick={handleClick}
    >
      {ContentComponent ? <ContentComponent {...contentProps} /> : null}
      <div className={styles.particles} aria-hidden="true"></div>
      <span className={styles.halo} aria-hidden="true"></span>
    </button>,
    updateAvailable?.version
  );
}
