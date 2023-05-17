import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloseIcon, NewIcon, ResetIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { startTransition, useEffect } from 'react';

import { changelogCheckedAtom, updateReadyAtom } from '../index.jotai';
import * as styles from './index.css';

interface AddPageButtonProps {
  className?: string;
  style?: React.CSSProperties;
}

const currentVersionAtom = atom(async () => {
  const currentVersion = await window.apis?.updater.currentVersion();
  return currentVersion;
});

const currentChangelogUnreadAtom = atom(async get => {
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

  useEffect(() => {
    window.apis?.updater.checkForUpdatesAndNotify();
  }, []);

  const currentChangelogUnread = useAtomValue(currentChangelogUnreadAtom);
  const updateReady = useAtomValue(updateReadyAtom);
  const currentVersion = useAtomValue(currentVersionAtom);
  const onReadOrDismissChangelog = useSetAtom(changelogCheckedAtom);

  const onReadOrDismissCurrentChangelog = (visit: boolean) => {
    if (visit) {
      window.open('https://github.com/toeverything/AFFiNE/releases', '_blank');
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

  if (!updateReady && !currentChangelogUnread) {
    return null;
  }

  return (
    <button
      style={style}
      className={clsx([styles.root, className])}
      data-has-update={updateReady ? 'true' : 'false'}
      onClick={() => {
        if (updateReady) {
          window.apis?.updater.quitAndInstall();
        } else if (currentChangelogUnread) {
          onReadOrDismissCurrentChangelog(true);
        }
      }}
    >
      {updateReady && (
        <>
          <div className={clsx([styles.installLabelNormal])}>
            <span>{t['Update Available']()}</span>
            <span className={styles.versionLabel}>{updateReady?.version}</span>
          </div>
          <div className={clsx([styles.installLabelHover])}>
            <ResetIcon className={styles.icon} />
            <span>{t['Restart Install Client Update']()}</span>
          </div>
        </>
      )}
      {!updateReady && currentChangelogUnread && (
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
      )}
      <div className={styles.particles} aria-hidden="true"></div>
      <span className={styles.halo} aria-hidden="true"></span>
    </button>
  );
}
