import { Unreachable } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloseIcon, NewIcon, ResetIcon } from '@blocksuite/icons';
import { Tooltip } from '@toeverything/components/tooltip';
import {
  changelogCheckedAtom,
  currentChangelogUnreadAtom,
  currentVersionAtom,
  downloadProgressAtom,
  updateAvailableAtom,
  updateReadyAtom,
  useAppUpdater,
} from '@toeverything/hooks/use-app-updater';
import clsx from 'clsx';
import { useAtomValue, useSetAtom } from 'jotai';
import { startTransition, useCallback } from 'react';

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
  downloadProgress: number | null;
  appQuitting: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function AppUpdaterButtonPure({
  updateReady,
  onClickUpdate,
  onDismissCurrentChangelog,
  currentChangelogUnread,
  updateAvailable,
  downloadProgress,
  appQuitting,
  className,
  style,
}: AddPageButtonPureProps) {
  const t = useAFFiNEI18N();

  if (!updateAvailable && !currentChangelogUnread) {
    return null;
  }

  const updateAvailableNode = updateAvailable
    ? updateAvailable.allowAutoUpdate
      ? renderUpdateAvailableAllowAutoUpdate()
      : renderUpdateAvailableNotAllowAutoUpdate()
    : null;
  const whatsNew =
    !updateAvailable && currentChangelogUnread ? renderWhatsNew() : null;

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

  return wrapWithTooltip(
    <button
      style={style}
      className={clsx([styles.root, className])}
      data-has-update={!!updateAvailable}
      data-updating={appQuitting}
      data-disabled={
        (updateAvailable?.allowAutoUpdate && !updateReady) || appQuitting
      }
      onClick={onClickUpdate}
    >
      {updateAvailableNode}
      {whatsNew}
      <div className={styles.particles} aria-hidden="true"></div>
      <span className={styles.halo} aria-hidden="true"></span>
    </button>,
    updateAvailable?.version
  );

  function renderUpdateAvailableAllowAutoUpdate() {
    return (
      <div className={clsx([styles.updateAvailableWrapper])}>
        <div className={clsx([styles.installLabelNormal])}>
          <span className={styles.ellipsisTextOverflow}>
            {!updateReady
              ? t['com.affine.appUpdater.downloading']()
              : t['com.affine.appUpdater.updateAvailable']()}
          </span>
          <span className={styles.versionLabel}>
            {updateAvailable?.version}
          </span>
        </div>

        {updateReady ? (
          <div className={clsx([styles.installLabelHover])}>
            <ResetIcon className={styles.icon} />
            <span className={styles.ellipsisTextOverflow}>
              {t[
                appQuitting ? 'Loading' : 'com.affine.appUpdater.installUpdate'
              ]()}
            </span>
          </div>
        ) : (
          <div className={styles.progress}>
            <div
              className={styles.progressInner}
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  function renderUpdateAvailableNotAllowAutoUpdate() {
    return (
      <>
        <div className={clsx([styles.installLabelNormal])}>
          <span className={styles.ellipsisTextOverflow}>
            {t['com.affine.appUpdater.updateAvailable']()}
          </span>
          <span className={styles.versionLabel}>
            {updateAvailable?.version}
          </span>
        </div>

        <div className={clsx([styles.installLabelHover])}>
          <span className={styles.ellipsisTextOverflow}>
            {t['com.affine.appUpdater.openDownloadPage']()}
          </span>
        </div>
      </>
    );
  }

  function renderWhatsNew() {
    return (
      <>
        <div className={clsx([styles.whatsNewLabel])}>
          <NewIcon className={styles.icon} />
          <span className={styles.ellipsisTextOverflow}>
            {t['com.affine.appUpdater.whatsNew']()}
          </span>
        </div>
        <div
          className={styles.closeIcon}
          onClick={e => {
            onDismissCurrentChangelog();
            e.stopPropagation();
          }}
        >
          <CloseIcon />
        </div>
      </>
    );
  }
}

// Although it is called an input, it is actually a button.
export function AppUpdaterButton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const currentChangelogUnread = useAtomValue(currentChangelogUnreadAtom);
  const updateReady = useAtomValue(updateReadyAtom);
  const updateAvailable = useAtomValue(updateAvailableAtom);
  const downloadProgress = useAtomValue(downloadProgressAtom);
  const currentVersion = useAtomValue(currentVersionAtom);
  const { quitAndInstall, appQuitting } = useAppUpdater();
  const setChangelogCheckAtom = useSetAtom(changelogCheckedAtom);

  const dismissCurrentChangelog = useCallback(() => {
    if (!currentVersion) {
      return;
    }
    startTransition(() =>
      setChangelogCheckAtom(mapping => {
        return {
          ...mapping,
          [currentVersion]: true,
        };
      })
    );
  }, [currentVersion, setChangelogCheckAtom]);

  const handleClickUpdate = useCallback(() => {
    if (updateReady) {
      quitAndInstall();
    } else if (updateAvailable) {
      if (updateAvailable.allowAutoUpdate) {
        // wait for download to finish
      } else {
        window.open(
          `https://github.com/toeverything/AFFiNE/releases/tag/v${currentVersion}`,
          '_blank'
        );
      }
    } else if (currentChangelogUnread) {
      window.open(runtimeConfig.changelogUrl, '_blank');
      dismissCurrentChangelog();
    } else {
      throw new Unreachable();
    }
  }, [
    updateReady,
    quitAndInstall,
    updateAvailable,
    currentChangelogUnread,
    dismissCurrentChangelog,
    currentVersion,
  ]);

  return (
    <AppUpdaterButtonPure
      appQuitting={appQuitting}
      updateReady={!!updateReady}
      onClickUpdate={handleClickUpdate}
      onDismissCurrentChangelog={dismissCurrentChangelog}
      currentChangelogUnread={currentChangelogUnread}
      updateAvailable={updateAvailable}
      downloadProgress={downloadProgress}
      className={className}
      style={style}
    />
  );
}
