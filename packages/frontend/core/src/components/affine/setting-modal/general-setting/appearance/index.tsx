import { RadioButton, RadioButtonGroup, Switch } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import { SettingRow } from '@affine/component/setting-components';
import { SettingWrapper } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  type AppSetting,
  fontStyleOptions,
  windowFrameStyleOptions,
} from '@toeverything/infra/atom';
import { useTheme } from 'next-themes';
import { useCallback } from 'react';

import { useAppSettingHelper } from '../../../../../hooks/affine/use-app-setting-helper';
import { LanguageMenu } from '../../../language-menu';
import { DateFormatSetting } from './date-format-setting';
import { settingWrapper } from './style.css';

export const ThemeSettings = () => {
  const t = useAFFiNEI18N();
  const { setTheme, theme } = useTheme();

  return (
    <RadioButtonGroup
      width={250}
      className={settingWrapper}
      value={theme}
      onValueChange={useCallback(
        (value: string) => {
          setTheme(value);
        },
        [setTheme]
      )}
    >
      <RadioButton value="system" data-testid="system-theme-trigger">
        {t['com.affine.themeSettings.system']()}
      </RadioButton>
      <RadioButton value="light" data-testid="light-theme-trigger">
        {t['com.affine.themeSettings.light']()}
      </RadioButton>
      <RadioButton value="dark" data-testid="dark-theme-trigger">
        {t['com.affine.themeSettings.dark']()}
      </RadioButton>
    </RadioButtonGroup>
  );
};

const FontFamilySettings = () => {
  const t = useAFFiNEI18N();
  const { appSettings, updateSettings } = useAppSettingHelper();
  return (
    <RadioButtonGroup
      width={250}
      className={settingWrapper}
      value={appSettings.fontStyle}
      onValueChange={useCallback(
        (key: AppSetting['fontStyle']) => {
          updateSettings('fontStyle', key);
        },
        [updateSettings]
      )}
    >
      {fontStyleOptions.map(({ key, value }) => {
        let font = '';
        switch (key) {
          case 'Sans':
            font = t['com.affine.appearanceSettings.fontStyle.sans']();
            break;
          case 'Serif':
            font = t['com.affine.appearanceSettings.fontStyle.serif']();
            break;
          case 'Mono':
            font = t[`com.affine.appearanceSettings.fontStyle.mono`]();
            break;
          default:
            break;
        }
        return (
          <RadioButton
            key={key}
            value={key}
            data-testid="system-font-style-trigger"
            style={{
              fontFamily: value,
            }}
          >
            {font}
          </RadioButton>
        );
      })}
    </RadioButtonGroup>
  );
};

export const AppearanceSettings = () => {
  const t = useAFFiNEI18N();

  const { appSettings, updateSettings } = useAppSettingHelper();

  return (
    <>
      <SettingHeader
        title={t['com.affine.appearanceSettings.title']()}
        subtitle={t['com.affine.appearanceSettings.subtitle']()}
      />

      <SettingWrapper title={t['com.affine.appearanceSettings.theme.title']()}>
        <SettingRow
          name={t['com.affine.appearanceSettings.color.title']()}
          desc={t['com.affine.appearanceSettings.color.description']()}
        >
          <ThemeSettings />
        </SettingRow>
        <SettingRow
          name={t['com.affine.appearanceSettings.font.title']()}
          desc={t['com.affine.appearanceSettings.font.description']()}
        >
          <FontFamilySettings />
        </SettingRow>
        <SettingRow
          name={t['com.affine.appearanceSettings.language.title']()}
          desc={t['com.affine.appearanceSettings.language.description']()}
        >
          <div className={settingWrapper}>
            <LanguageMenu />
          </div>
        </SettingRow>
        {environment.isDesktop ? (
          <SettingRow
            name={t['com.affine.appearanceSettings.clientBorder.title']()}
            desc={t['com.affine.appearanceSettings.clientBorder.description']()}
            data-testid="client-border-style-trigger"
          >
            <Switch
              checked={appSettings.clientBorder}
              onChange={checked => updateSettings('clientBorder', checked)}
            />
          </SettingRow>
        ) : null}

        <SettingRow
          name={t['com.affine.appearanceSettings.fullWidth.title']()}
          desc={t['com.affine.appearanceSettings.fullWidth.description']()}
        >
          <Switch
            data-testid="full-width-layout-trigger"
            checked={appSettings.fullWidthLayout}
            onChange={checked => updateSettings('fullWidthLayout', checked)}
          />
        </SettingRow>
        {runtimeConfig.enableNewSettingUnstableApi && environment.isDesktop ? (
          <SettingRow
            name={t['com.affine.appearanceSettings.windowFrame.title']()}
            desc={t['com.affine.appearanceSettings.windowFrame.description']()}
          >
            <RadioButtonGroup
              className={settingWrapper}
              width={250}
              defaultValue={appSettings.windowFrameStyle}
              onValueChange={(value: AppSetting['windowFrameStyle']) => {
                updateSettings('windowFrameStyle', value);
              }}
            >
              {windowFrameStyleOptions.map(option => {
                return (
                  <RadioButton value={option} key={option}>
                    {t[`com.affine.appearanceSettings.windowFrame.${option}`]()}
                  </RadioButton>
                );
              })}
            </RadioButtonGroup>
          </SettingRow>
        ) : null}
      </SettingWrapper>
      {runtimeConfig.enableNewSettingUnstableApi ? (
        <SettingWrapper title={t['com.affine.appearanceSettings.date.title']()}>
          <SettingRow
            name={t['com.affine.appearanceSettings.dateFormat.title']()}
            desc={t['com.affine.appearanceSettings.dateFormat.description']()}
          >
            <div className={settingWrapper}>
              <DateFormatSetting />
            </div>
          </SettingRow>
          <SettingRow
            name={t['com.affine.appearanceSettings.startWeek.title']()}
            desc={t['com.affine.appearanceSettings.startWeek.description']()}
          >
            <Switch
              checked={appSettings.startWeekOnMonday}
              onChange={checked => updateSettings('startWeekOnMonday', checked)}
            />
          </SettingRow>
        </SettingWrapper>
      ) : null}

      {environment.isDesktop ? (
        <SettingWrapper
          title={t['com.affine.appearanceSettings.sidebar.title']()}
        >
          <SettingRow
            name={t['com.affine.appearanceSettings.noisyBackground.title']()}
            desc={t[
              'com.affine.appearanceSettings.noisyBackground.description'
            ]()}
          >
            <Switch
              checked={appSettings.enableNoisyBackground}
              onChange={checked =>
                updateSettings('enableNoisyBackground', checked)
              }
            />
          </SettingRow>
          {
            <SettingRow
              name={t['com.affine.appearanceSettings.translucentUI.title']()}
              desc={t[
                'com.affine.appearanceSettings.translucentUI.description'
              ]()}
            >
              <Switch
                checked={appSettings.enableBlurBackground}
                onChange={checked =>
                  updateSettings('enableBlurBackground', checked)
                }
              />
            </SettingRow>
          }
        </SettingWrapper>
      ) : null}
    </>
  );
};
