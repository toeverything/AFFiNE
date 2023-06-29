import { Switch } from '@affine/component';
import { relatedLinks } from '@affine/component/contact-modal';
import { SettingHeader } from '@affine/component/setting-components';
import { SettingRow } from '@affine/component/setting-components';
import { SettingWrapper } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon, OpenInNewIcon } from '@blocksuite/icons';
import { useCallback } from 'react';

import { type AppSetting, useAppSetting } from '../../../../../atoms/settings';
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
      <SettingHeader title={t['About AFFiNE']()} subtitle={t['None yet']()} />
      {runtimeConfig.enableNewSettingUnstableApi && environment.isDesktop ? (
        <SettingWrapper title={t['Version']()}>
          <SettingRow
            name={t['Check for updates']()}
            desc={t['New version is ready']()}
          ></SettingRow>
          <SettingRow
            name={t['Check for updates automatically']()}
            desc={t[
              'If enabled, it will automatically check for new versions at regular intervals.'
            ]()}
          >
            <Switch
              checked={appSettings.autoCheckUpdate}
              onChange={checked => changeSwitch('autoCheckUpdate', checked)}
            />
          </SettingRow>
          <SettingRow
            name={t['Download updates automatically']()}
            desc={t[
              'If enabled, new versions will be automatically downloaded to the current device.'
            ]()}
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
                'https://github.com/toeverything/AFFiNE/releases',
                '_blank'
              );
            }}
          >
            <ArrowRightSmallIcon />
          </SettingRow>
        </SettingWrapper>
      ) : null}
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
