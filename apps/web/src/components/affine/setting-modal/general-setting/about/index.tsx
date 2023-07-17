import { Switch } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import { SettingRow } from '@affine/component/setting-components';
import { SettingWrapper } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon, OpenInNewIcon } from '@blocksuite/icons';
import { useCallback } from 'react';

import { type AppSetting, useAppSetting } from '../../../../../atoms/settings';
import { relatedLinks } from './config';
import { communityItem, communityWrapper, link } from './style.css';

export const AboutAffine = () => {
  const t = useAFFiNEI18N();
  const [appSettings, setAppSettings] = useAppSetting();
  const changeSwitch = useCallback(
    (key: keyof AppSetting, checked: boolean) => {
      setAppSettings({ [key]: checked });
    },
    [setAppSettings]
  );
  return (
    <>
      <SettingHeader
        title={t['About AFFiNE']()}
        subtitle={t['com.affine.settings.about.message']()}
        data-testid="about-title"
      />
      <SettingWrapper title={t['Version']()}>
        <SettingRow name="App Version" desc={runtimeConfig.appVersion} />
        <SettingRow name="Editor Version" desc={runtimeConfig.editorVersion} />
        {runtimeConfig.enableNewSettingUnstableApi && environment.isDesktop ? (
          <>
            <SettingRow
              name={t['Check for updates']()}
              desc={t['New version is ready']()}
            ></SettingRow>
            <SettingRow
              name={t['Check for updates automatically']()}
              desc={t['com.affine.settings.about.update.check.message']()}
            >
              <Switch
                checked={appSettings.autoCheckUpdate}
                onChange={checked => changeSwitch('autoCheckUpdate', checked)}
              />
            </SettingRow>
            <SettingRow
              name={t['Download updates automatically']()}
              desc={t['com.affine.settings.about.update.download.message']()}
            >
              <Switch
                checked={appSettings.autoCheckUpdate}
                onChange={checked => changeSwitch('autoCheckUpdate', checked)}
              />
            </SettingRow>
            <SettingRow
              name={t[`Discover what's new`]()}
              desc={t['View the AFFiNE Changelog.']()}
              style={{ cursor: 'pointer' }}
              onClick={() => {
                window.open(
                  'https://affine.pro/blog/what-is-new-affine-0717',
                  '_blank'
                );
              }}
            >
              <ArrowRightSmallIcon />
            </SettingRow>
          </>
        ) : null}
      </SettingWrapper>
      <SettingWrapper title={t['Contact with us']()}>
        <a className={link} href="https://affine.pro" target="_blank">
          {t['Official Website']()}
          <OpenInNewIcon className="icon" />
        </a>
        <a className={link} href="https://community.affine.pro" target="_blank">
          {t['AFFiNE Community']()}
          <OpenInNewIcon className="icon" />
        </a>
      </SettingWrapper>
      <SettingWrapper title={t['Communities']()}>
        <div className={communityWrapper}>
          {relatedLinks.map(({ icon, title, link }) => {
            return (
              <div
                className={communityItem}
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
      <SettingWrapper title={t['Info of legal']()}>
        <a className={link} href="https://affine.pro/privacy" target="_blank">
          {t['Privacy']()}
          <OpenInNewIcon className="icon" />
        </a>
        <a className={link} href="https://affine.pro/terms" target="_blank">
          {t['Terms of Use']()}
          <OpenInNewIcon className="icon" />
        </a>
      </SettingWrapper>
    </>
  );
};
