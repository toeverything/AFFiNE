import { RadioButton, RadioButtonGroup, Switch } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import { SettingRow } from '@affine/component/setting-components';
import { SettingWrapper } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useTheme } from 'next-themes';
import { useCallback } from 'react';

import {
  type AppSetting,
  fontStyleOptions,
  useAppSetting,
  windowFrameStyleOptions,
} from '../../../../../atoms/settings';
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
      defaultValue={theme}
      onValueChange={useCallback(
        (value: string) => {
          setTheme(value);
        },
        [setTheme]
      )}
    >
      <RadioButton
        bold={true}
        value="system"
        data-testid="system-theme-trigger"
      >
        {t['system']()}
      </RadioButton>
      <RadioButton bold={true} value="light" data-testid="light-theme-trigger">
        {t['light']()}
      </RadioButton>
      <RadioButton bold={true} value="dark" data-testid="dark-theme-trigger">
        {t['dark']()}
      </RadioButton>
    </RadioButtonGroup>
  );
};

const FontFamilySettings = () => {
  const [appSettings, setAppSettings] = useAppSetting();
  return (
    <RadioButtonGroup
      width={250}
      className={settingWrapper}
      defaultValue={appSettings.fontStyle}
      onValueChange={useCallback(
        (key: AppSetting['fontStyle']) => {
          setAppSettings({ fontStyle: key });
        },
        [setAppSettings]
      )}
    >
      {fontStyleOptions.map(({ key, value }) => {
        return (
          <RadioButton
            key={key}
            bold={true}
            value={key}
            data-testid="system-font-style-trigger"
            style={{
              fontFamily: value,
            }}
          >
            {key}
          </RadioButton>
        );
      })}
    </RadioButtonGroup>
  );
};

export const AppearanceSettings = () => {
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
        title={t['Appearance Settings']()}
        subtitle={t['Customize your  AFFiNE Appearance']()}
      />

      <SettingWrapper title={t['Theme']()}>
        <SettingRow
          name={t['Color Scheme']()}
          desc={t['Choose your color scheme']()}
        >
          <ThemeSettings />
        </SettingRow>
        <SettingRow
          name={t['Font Style']()}
          desc={t['Choose your font style']()}
        >
          <FontFamilySettings />
        </SettingRow>
        <SettingRow
          name={t['Display Language']()}
          desc={t['Select the language for the interface.']()}
        >
          <div className={settingWrapper}>
            <LanguageMenu triggerProps={{ size: 'small' }} />
          </div>
        </SettingRow>
        {runtimeConfig.enableNewSettingUnstableApi && environment.isDesktop ? (
          <SettingRow
            name={t['Client Border Style']()}
            desc={t['Customize the appearance of the client.']()}
          >
            <Switch
              checked={appSettings.clientBorder}
              onChange={checked => changeSwitch('clientBorder', checked)}
            />
          </SettingRow>
        ) : null}

        <SettingRow
          name={t['Full width Layout']()}
          desc={t['Maximum display of content within a page.']()}
        >
          <Switch
            data-testid="full-width-layout-trigger"
            checked={appSettings.fullWidthLayout}
            onChange={checked => changeSwitch('fullWidthLayout', checked)}
          />
        </SettingRow>
        {runtimeConfig.enableNewSettingUnstableApi && environment.isDesktop ? (
          <SettingRow
            name={t['Window frame style']()}
            desc={t['Customize appearance of Windows Client.']()}
          >
            <RadioButtonGroup
              className={settingWrapper}
              width={250}
              defaultValue={appSettings.windowFrameStyle}
              onValueChange={(value: AppSetting['windowFrameStyle']) => {
                setAppSettings({ windowFrameStyle: value });
              }}
            >
              {windowFrameStyleOptions.map(option => {
                return (
                  <RadioButton value={option} key={option}>
                    {t[option]()}
                  </RadioButton>
                );
              })}
            </RadioButtonGroup>
          </SettingRow>
        ) : null}
      </SettingWrapper>
      {runtimeConfig.enableNewSettingUnstableApi ? (
        <SettingWrapper title={t['Date']()}>
          <SettingRow
            name={t['Date Format']()}
            desc={t['Customize your date style.']()}
          >
            <div className={settingWrapper}>
              <DateFormatSetting />
            </div>
          </SettingRow>
          <SettingRow
            name={t['Start Week On Monday']()}
            desc={t['By default, the week starts on Sunday.']()}
          >
            <Switch
              checked={appSettings.startWeekOnMonday}
              onChange={checked => changeSwitch('startWeekOnMonday', checked)}
            />
          </SettingRow>
        </SettingWrapper>
      ) : null}

      {environment.isDesktop ? (
        <SettingWrapper title={t['Sidebar']()}>
          <SettingRow
            name={t['com.affine.settings.appearance.sidebar.noise']()}
            desc={t['com.affine.settings.appearance.sidebar.noise.message']()}
          >
            <Switch
              checked={appSettings.enableNoisyBackground}
              onChange={checked =>
                changeSwitch('enableNoisyBackground', checked)
              }
            />
          </SettingRow>
          <SettingRow
            name={t['com.affine.settings.appearance.sidebar.translucent']()}
            desc={t[
              'com.affine.settings.appearance.sidebar.translucent.message'
            ]()}
          >
            <Switch
              checked={appSettings.enableBlurBackground}
              onChange={checked =>
                changeSwitch('enableBlurBackground', checked)
              }
            />
          </SettingRow>
        </SettingWrapper>
      ) : null}
    </>
  );
};
