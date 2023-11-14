import { Switch } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import { SettingRow } from '@affine/component/setting-components';
import { SettingWrapper } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon, OpenInNewIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import {
  downloadProgressAtom,
  isCheckingForUpdatesAtom,
  updateAvailableAtom,
  updateReadyAtom,
  useAppUpdater,
} from '@toeverything/hooks/use-app-updater';
import clsx from 'clsx';
import { useAtomValue } from 'jotai';
import { useCallback, useMemo } from 'react';

import { useAppSettingHelper } from '../../../../../hooks/affine/use-app-setting-helper';
import { Loading } from '../../../../pure/workspace-slider-bar/workspace-card/loading-icon';
import { relatedLinks } from './config';
import * as styles from './style.css';

export const AboutAffine = () => {
  const t = useAFFiNEI18N();
  const { appSettings, updateSettings } = useAppSettingHelper();
  const {
    checkForUpdates,
    downloadUpdate,
    toggleAutoCheck,
    toggleAutoDownload,
    quitAndInstall,
  } = useAppUpdater();
  const isCheckingForUpdates = useAtomValue(isCheckingForUpdatesAtom);
  const updateAvailable = useAtomValue(updateAvailableAtom);
  const updateReady = useAtomValue(updateReadyAtom);
  const downloadProgress = useAtomValue(downloadProgressAtom);

  const onSwitchAutoCheck = useCallback(
    (checked: boolean) => {
      toggleAutoCheck(checked);
      updateSettings('autoCheckUpdate', checked);
    },
    [toggleAutoCheck, updateSettings]
  );

  const onSwitchAutoDownload = useCallback(
    (checked: boolean) => {
      toggleAutoDownload(checked);
      updateSettings('autoDownloadUpdate', checked);
    },
    [toggleAutoDownload, updateSettings]
  );

  const handleClick = useCallback(() => {
    if (updateAvailable && downloadProgress === null) {
      return downloadUpdate();
    }
    if (updateReady) {
      return quitAndInstall();
    }
    checkForUpdates();
  }, [
    checkForUpdates,
    downloadProgress,
    downloadUpdate,
    quitAndInstall,
    updateAvailable,
    updateReady,
  ]);

  const checkUpdateButtonLabel = useMemo(() => {
    if (updateAvailable && downloadProgress === null) {
      return t['com.affine.aboutAFFiNE.checkUpdate.button.download']();
    }
    if (updateReady) {
      return t['com.affine.aboutAFFiNE.checkUpdate.button.restart']();
    }
    return t['com.affine.aboutAFFiNE.checkUpdate.button.check']();
  }, [downloadProgress, t, updateAvailable, updateReady]);

  const checkUpdateSubtitleLabel = useMemo(() => {
    if (updateAvailable && downloadProgress === null) {
      return t['com.affine.aboutAFFiNE.checkUpdate.subtitle.update-available']({
        version: updateAvailable.version,
      });
    } else if (isCheckingForUpdates) {
      return t['com.affine.aboutAFFiNE.checkUpdate.subtitle.checking']();
    } else if (updateAvailable && downloadProgress !== null) {
      return t['com.affine.aboutAFFiNE.checkUpdate.subtitle.downloading']();
    } else if (updateReady) {
      return t['com.affine.aboutAFFiNE.checkUpdate.subtitle.restart']();
    } else {
      return t['com.affine.aboutAFFiNE.checkUpdate.subtitle.check']();
    }
  }, [downloadProgress, isCheckingForUpdates, t, updateAvailable, updateReady]);

  const checkUpdateSubtitle = useMemo(() => {
    return (
      <span
        className={clsx(styles.checkUpdateDesc, {
          active: updateReady || (updateAvailable && downloadProgress === null),
        })}
      >
        {isCheckingForUpdates ? <Loading size={14} /> : null}
        {checkUpdateSubtitleLabel}
      </span>
    );
  }, [
    checkUpdateSubtitleLabel,
    downloadProgress,
    isCheckingForUpdates,
    updateAvailable,
    updateReady,
  ]);

  return (
    <>
      <SettingHeader
        title={t['com.affine.aboutAFFiNE.title']()}
        subtitle={t['com.affine.aboutAFFiNE.subtitle']()}
        data-testid="about-title"
      />
      <SettingWrapper title={t['com.affine.aboutAFFiNE.version.title']()}>
        <SettingRow
          name={t['com.affine.aboutAFFiNE.version.app']()}
          desc={runtimeConfig.appVersion}
        />
        <SettingRow
          name={t['com.affine.aboutAFFiNE.version.editor.title']()}
          desc={runtimeConfig.editorVersion}
        />
        {environment.isDesktop ? (
          <>
            <SettingRow
              name={t['com.affine.aboutAFFiNE.checkUpdate.title']()}
              desc={checkUpdateSubtitle}
            >
              <Button
                data-testid="check-update-button"
                onClick={handleClick}
                disabled={false}
              >
                {checkUpdateButtonLabel}
              </Button>
            </SettingRow>
            <SettingRow
              name={t['com.affine.aboutAFFiNE.autoCheckUpdate.title']()}
              desc={t['com.affine.aboutAFFiNE.autoCheckUpdate.description']()}
            >
              <Switch
                checked={appSettings.autoCheckUpdate}
                onChange={onSwitchAutoCheck}
              />
            </SettingRow>
            <SettingRow
              name={t['com.affine.aboutAFFiNE.autoDownloadUpdate.title']()}
              desc={t[
                'com.affine.aboutAFFiNE.autoDownloadUpdate.description'
              ]()}
            >
              <Switch
                checked={appSettings.autoDownloadUpdate}
                onChange={onSwitchAutoDownload}
              />
            </SettingRow>
            <SettingRow
              name={t['com.affine.aboutAFFiNE.changelog.title']()}
              desc={t['com.affine.aboutAFFiNE.changelog.description']()}
              style={{ cursor: 'pointer' }}
              onClick={() => {
                window.open(runtimeConfig.changelogUrl, '_blank');
              }}
            >
              <ArrowRightSmallIcon />
            </SettingRow>
          </>
        ) : null}
      </SettingWrapper>
      <SettingWrapper title={t['com.affine.aboutAFFiNE.contact.title']()}>
        <a
          className={styles.link}
          rel="noreferrer"
          href="https://affine.pro"
          target="_blank"
        >
          {t['com.affine.aboutAFFiNE.contact.website']()}
          <OpenInNewIcon className="icon" />
        </a>
        <a
          className={styles.link}
          rel="noreferrer"
          href="https://community.affine.pro"
          target="_blank"
        >
          {t['com.affine.aboutAFFiNE.contact.community']()}
          <OpenInNewIcon className="icon" />
        </a>
      </SettingWrapper>
      <SettingWrapper title={t['com.affine.aboutAFFiNE.community.title']()}>
        <div className={styles.communityWrapper}>
          {relatedLinks.map(({ icon, title, link }) => {
            return (
              <div
                className={styles.communityItem}
                onClick={() => {
                  window.open(link, '_blank');
                }}
                key={title}
              >
                {icon}
                <p>{title}</p>
              </div>
            );
          })}
        </div>
      </SettingWrapper>
      <SettingWrapper title={t['com.affine.aboutAFFiNE.legal.title']()}>
        <a
          className={styles.link}
          rel="noreferrer"
          href="https://affine.pro/privacy"
          target="_blank"
        >
          {t['com.affine.aboutAFFiNE.legal.privacy']()}
          <OpenInNewIcon className="icon" />
        </a>
        <a
          className={styles.link}
          rel="noreferrer"
          href="https://affine.pro/terms"
          target="_blank"
        >
          {t['com.affine.aboutAFFiNE.legal.tos']()}
          <OpenInNewIcon className="icon" />
        </a>
      </SettingWrapper>
    </>
  );
};
