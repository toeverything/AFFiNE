import { Switch } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import { SettingRow } from '@affine/component/setting-components';
import { SettingWrapper } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon, OpenInNewIcon } from '@blocksuite/icons';

import { useAppSettingHelper } from '../../../../../hooks/affine/use-app-setting-helper';
import { relatedLinks } from './config';
import { communityItem, communityWrapper, link } from './style.css';

export const AboutAffine = () => {
  const t = useAFFiNEI18N();
  const { appSettings, updateSettings } = useAppSettingHelper();
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
        {runtimeConfig.enableNewSettingUnstableApi && environment.isDesktop ? (
          <>
            <SettingRow
              name={t['com.affine.aboutAFFiNE.checkUpdate.title']()}
              desc={t['com.affine.aboutAFFiNE.checkUpdate.description']()}
            />
            <SettingRow
              name={t['com.affine.aboutAFFiNE.autoCheckUpdate.title']()}
              desc={t['com.affine.aboutAFFiNE.autoCheckUpdate.description']()}
            >
              <Switch
                checked={appSettings.autoCheckUpdate}
                onChange={checked => updateSettings('autoCheckUpdate', checked)}
              />
            </SettingRow>
            <SettingRow
              name={t['com.affine.aboutAFFiNE.autoDownloadUpdate.title']()}
              desc={t[
                'com.affine.aboutAFFiNE.autoDownloadUpdate.description'
              ]()}
            >
              <Switch
                checked={appSettings.autoCheckUpdate}
                onChange={checked => updateSettings('autoCheckUpdate', checked)}
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
          className={link}
          rel="noreferrer"
          href="https://affine.pro"
          target="_blank"
        >
          {t['com.affine.aboutAFFiNE.contact.website']()}
          <OpenInNewIcon className="icon" />
        </a>
        <a
          className={link}
          rel="noreferrer"
          href="https://community.affine.pro"
          target="_blank"
        >
          {t['com.affine.aboutAFFiNE.contact.community']()}
          <OpenInNewIcon className="icon" />
        </a>
      </SettingWrapper>
      <SettingWrapper title={t['com.affine.aboutAFFiNE.community.title']()}>
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
      <SettingWrapper title={t['com.affine.aboutAFFiNE.legal.title']()}>
        <a
          className={link}
          rel="noreferrer"
          href="https://affine.pro/privacy"
          target="_blank"
        >
          {t['com.affine.aboutAFFiNE.legal.privacy']()}
          <OpenInNewIcon className="icon" />
        </a>
        <a
          className={link}
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
