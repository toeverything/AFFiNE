import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloseIcon, NewIcon, ResetIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { startTransition } from 'react';

import * as styles from './index.css';
import {
  changelogCheckedAtom,
  downloadProgressAtom,
  updateAvailableAtom,
  updateReadyAtom,
} from './index.jotai';

interface AddPageButtonProps {
  className?: string;
  style?: React.CSSProperties;
}

const currentVersionAtom = atom(async () => {
  if (typeof window === 'undefined') {
    return null;
  }
  const currentVersion = await window.apis?.updater.currentVersion();
  return currentVersion;
});

const currentChangelogUnreadAtom = atom(async get => {
  if (typeof window === 'undefined') {
    return false;
  }
  const mapping = get(changelogCheckedAtom);
  const currentVersion = await get(currentVersionAtom);
  if (currentVersion) {
    return !mapping[currentVersion];
  }
  return false;
});

// Although it is called an input, it is actually a button.
export function AppUpdaterButton({ className, style }: AddPageButtonProps) {
  const t = useAFFiNEI18N();

  const currentChangelogUnread = useAtomValue(currentChangelogUnreadAtom);
  const updateReady = useAtomValue(updateReadyAtom);
  const updateAvailable = useAtomValue(updateAvailableAtom);
  const currentVersion = useAtomValue(currentVersionAtom);
  const downloadProgress = useAtomValue(downloadProgressAtom);
  const onReadOrDismissChangelog = useSetAtom(changelogCheckedAtom);

  const onReadOrDismissCurrentChangelog = (visit: boolean) => {
    if (visit) {
      window.open(
        `https://github.com/toeverything/AFFiNE/releases/tag/v${currentVersion}`,
        '_blank'
      );
    }

    startTransition(() =>
      onReadOrDismissChangelog(mapping => {
        return {
          ...mapping,
          [currentVersion!]: true,
        };
      })
    );
  };

  if (!updateAvailable && !currentChangelogUnread) {
    return null;
  }

  return (
    <button
      style={style}
      className={clsx([styles.root, className])}
      data-has-update={updateAvailable ? 'true' : 'false'}
      data-disabled={updateAvailable?.allowAutoUpdate && !updateReady}
      onClick={() => {
        if (updateReady) {
          window.apis?.updater.quitAndInstall();
        } else if (updateAvailable?.allowAutoUpdate) {
          // wait for download to finish
        } else if (updateAvailable || currentChangelogUnread) {
          onReadOrDismissCurrentChangelog(true);
        }
      }}
    >
      {updateAvailable &&
        (updateAvailable.allowAutoUpdate
          ? renderUpdateAvailableAllowAutoUpdate()
          : renderUpdateAvailableNotAllowAutoUpdate())}

      {!updateAvailable && currentChangelogUnread && renderWhatsNew()}
      <div className={styles.particles} aria-hidden="true"></div>
      <span className={styles.halo} aria-hidden="true"></span>
    </button>
  );

  function renderUpdateAvailableAllowAutoUpdate() {
    return (
      <div className={clsx([styles.updateAvailableWrapper])}>
        <div className={clsx([styles.installLabelNormal])}>
          <span>
            {!updateReady
              ? t['com.affine.updater.downloading']()
              : t['com.affine.updater.update-available']()}
          </span>
          <span className={styles.versionLabel}>
            {updateAvailable?.version}
          </span>
        </div>

        {updateReady ? (
          <div className={clsx([styles.installLabelHover])}>
            <ResetIcon className={styles.icon} />
            <span>{t['com.affine.updater.restart-to-update']()}</span>
          </div>
        ) : (
          <div className={styles.progress}>
            <div
              className={styles.progressInner}
              style={{ width: `${downloadProgress}%` }}
            ></div>
          </div>
        )}
      </div>
    );
  }

  function renderUpdateAvailableNotAllowAutoUpdate() {
    return (
      <>
        <div className={clsx([styles.installLabelNormal])}>
          <span>{t['com.affine.updater.update-available']()}</span>
          <span className={styles.versionLabel}>
            {updateAvailable?.version}
          </span>
        </div>

        <div className={clsx([styles.installLabelHover])}>
          <span>{t['com.affine.updater.open-download-page']()}</span>
        </div>
      </>
    );
  }

  function renderWhatsNew() {
    return (
      <>
        <div className={clsx([styles.whatsNewLabel])}>
          <NewIcon className={styles.icon} />
          <span>{t[`Discover what's new!`]()}</span>
        </div>
        <div
          className={styles.closeIcon}
          onClick={e => {
            onReadOrDismissCurrentChangelog(false);
            e.stopPropagation();
          }}
        >
          <CloseIcon />
        </div>
      </>
    );
  }
}
