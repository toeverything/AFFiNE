import { Switch } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import { SettingRow } from '@affine/component/setting-components';
import { SettingWrapper } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon, OpenInNewIcon } from '@blocksuite/icons';
import { useAppUpdater } from '@toeverything/hooks/use-app-updater';
import { useCallback } from 'react';

import { useAppSettingHelper } from '../../../../../hooks/affine/use-app-setting-helper';
import { appIconMap, appNames } from '../../../../../pages/open-app';
import { relatedLinks } from './config';
import * as styles from './style.css';
import { UpdateCheckSection } from './update-check-section';

export const AboutAffine = () => {
  const t = useAFFiNEI18N();
  const { appSettings, updateSettings } = useAppSettingHelper();
  const { toggleAutoCheck, toggleAutoDownload } = useAppUpdater();
  const channel = runtimeConfig.appBuildType;
  const appIcon = appIconMap[channel];
  const appName = appNames[channel];

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

  return (
    <>
      <SettingHeader
        title={t['com.affine.aboutAFFiNE.title']()}
        subtitle={t['com.affine.aboutAFFiNE.subtitle']()}
        data-testid="about-title"
      />
      <SettingWrapper title={t['com.affine.aboutAFFiNE.version.title']()}>
        <SettingRow
          name={appName}
          desc={runtimeConfig.appVersion}
          className={styles.appImageRow}
        >
          <img src={appIcon} alt={appName} width={56} height={56} />
        </SettingRow>
        <SettingRow
          name={t['com.affine.aboutAFFiNE.version.editor.title']()}
          desc={runtimeConfig.editorVersion}
        />
        {environment.isDesktop ? (
          <>
            <UpdateCheckSection />
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
