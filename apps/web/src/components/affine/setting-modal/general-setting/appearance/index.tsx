import { RadioButton, RadioButtonGroup, Switch } from '@affine/component';
import { env } from '@affine/env';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useTheme } from 'next-themes';
import { useCallback } from 'react';

import {
  type AppSetting,
  useAppSetting,
  windowFrameStyleOptions,
} from '../../../../../atoms/settings';
import { LanguageMenu } from '../../../language-menu';
import { SettingHeader } from '../../common/setting-header';
import { SettingRow } from '../../common/setting-row';
import { Wrapper } from '../../common/wrapper';
import { IS_EXHIBITION } from '../../config';
import { DateFormatSetting } from './date-format-setting';
import { settingWrapper } from './style.css';

export const ThemeSettings = () => {
  const t = useAFFiNEI18N();
  const { setTheme, theme } = useTheme();

  return (
    <RadioButtonGroup
      className={settingWrapper}
      defaultValue={theme}
      onValueChange={useCallback(
        (value: string) => {
          setTheme(value);
        },
        [setTheme]
      )}
    >
      <RadioButton value="system">{t['system']()}</RadioButton>
      <RadioButton value="light">{t['light']()}</RadioButton>
      <RadioButton value="dark">{t['dark']()}</RadioButton>
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

      <Wrapper title={t['Theme']()}>
        <SettingRow
          name={t['Color Scheme']()}
          desc={t['Choose your color scheme']()}
        >
          <ThemeSettings />
        </SettingRow>
        <SettingRow
          name={t['Display Language']()}
          desc={t['Select the language for the interface.']()}
        >
          <div className={settingWrapper}>
            <LanguageMenu />
          </div>
        </SettingRow>
        {IS_EXHIBITION && env.isDesktop ? (
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
            checked={appSettings.fullWidthLayout}
            onChange={checked => changeSwitch('fullWidthLayout', checked)}
          />
        </SettingRow>
        {IS_EXHIBITION && env.isDesktop ? (
          <SettingRow
            name={t['Window frame style']()}
            desc={t['Customize appearance of Windows Client.']()}
          >
            <RadioButtonGroup
              className={settingWrapper}
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
      </Wrapper>
      {IS_EXHIBITION ? (
        <Wrapper title={t['Date']()}>
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
        </Wrapper>
      ) : null}

      {env.isDesktop ? (
        <Wrapper title={t['Sidebar']()}>
          <SettingRow
            name={t['Disable the noise background on the sidebar']()}
            desc={t['None yet']()}
          >
            <Switch
              checked={appSettings.disableNoisyBackground}
              onChange={checked =>
                changeSwitch('disableNoisyBackground', checked)
              }
            />
          </SettingRow>
          <SettingRow
            name={t['Disable the blur sidebar']()}
            desc={t['None yet']()}
          >
            <Switch
              checked={appSettings.disableBlurBackground}
              onChange={checked =>
                changeSwitch('disableBlurBackground', checked)
              }
            />
          </SettingRow>
        </Wrapper>
      ) : null}
    </>
  );
};
