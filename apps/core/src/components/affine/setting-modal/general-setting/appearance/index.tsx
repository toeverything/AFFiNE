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
      <RadioButton value="system" data-testid="system-theme-trigger">
        {t['com.affine.core.themeSettings.system']()}
      </RadioButton>
      <RadioButton value="light" data-testid="light-theme-trigger">
        {t['com.affine.core.themeSettings.light']()}
      </RadioButton>
      <RadioButton value="dark" data-testid="dark-theme-trigger">
        {t['com.affine.core.themeSettings.dark']()}
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
        title={t['com.affine.core.appearanceSettings.title']()}
        subtitle={t['com.affine.core.appearanceSettings.subtitle']()}
      />

      <SettingWrapper
        title={t['com.affine.core.appearanceSettings.theme.title']()}
      >
        <SettingRow
          name={t['com.affine.core.appearanceSettings.color.title']()}
          desc={t['com.affine.core.appearanceSettings.color.description']()}
        >
          <ThemeSettings />
        </SettingRow>
        <SettingRow
          name={t['com.affine.core.appearanceSettings.font.title']()}
          desc={t['com.affine.core.appearanceSettings.font.description']()}
        >
          <FontFamilySettings />
        </SettingRow>
        <SettingRow
          name={t['com.affine.core.appearanceSettings.language.title']()}
          desc={t['com.affine.core.appearanceSettings.language.description']()}
        >
          <div className={settingWrapper}>
            <LanguageMenu
              triggerContainerStyle={{ width: '100%' }}
              triggerProps={{
                style: {
                  width: '100%',
                  justifyContent: 'space-between',
                  fontWeight: 600,
                  padding: '0 10px',
                },
              }}
            />
          </div>
        </SettingRow>
        {environment.isDesktop ? (
          <SettingRow
            name={t['com.affine.core.appearanceSettings.clientBorder.title']()}
            desc={t[
              'com.affine.core.appearanceSettings.clientBorder.description'
            ]()}
            data-testid="client-border-style-trigger"
          >
            <Switch
              checked={appSettings.clientBorder}
              onChange={checked => changeSwitch('clientBorder', checked)}
            />
          </SettingRow>
        ) : null}

        <SettingRow
          name={t['com.affine.core.appearanceSettings.fullWidth.title']()}
          desc={t['com.affine.core.appearanceSettings.fullWidth.description']()}
        >
          <Switch
            data-testid="full-width-layout-trigger"
            checked={appSettings.fullWidthLayout}
            onChange={checked => changeSwitch('fullWidthLayout', checked)}
          />
        </SettingRow>
        {runtimeConfig.enableNewSettingUnstableApi && environment.isDesktop ? (
          <SettingRow
            name={t['com.affine.core.appearanceSettings.windowFrame.title']()}
            desc={t[
              'com.affine.core.appearanceSettings.windowFrame.description'
            ]()}
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
                    {t[
                      `com.affine.core.appearanceSettings.windowFrame.${option}`
                    ]()}
                  </RadioButton>
                );
              })}
            </RadioButtonGroup>
          </SettingRow>
        ) : null}
      </SettingWrapper>
      {runtimeConfig.enableNewSettingUnstableApi ? (
        <SettingWrapper
          title={t['com.affine.core.appearanceSettings.date.title']()}
        >
          <SettingRow
            name={t['com.affine.core.appearanceSettings.dateFormat.title']()}
            desc={t[
              'com.affine.core.appearanceSettings.dateFormat.description'
            ]()}
          >
            <div className={settingWrapper}>
              <DateFormatSetting />
            </div>
          </SettingRow>
          <SettingRow
            name={t['com.affine.core.appearanceSettings.startWeek.title']()}
            desc={t[
              'com.affine.core.appearanceSettings.startWeek.description'
            ]()}
          >
            <Switch
              checked={appSettings.startWeekOnMonday}
              onChange={checked => changeSwitch('startWeekOnMonday', checked)}
            />
          </SettingRow>
        </SettingWrapper>
      ) : null}

      {environment.isDesktop ? (
        <SettingWrapper title={t['com.affine.core.appearanceSettings.sidebar.title']()}>
          <SettingRow
            name={t['com.affine.core.appearanceSettings.noisyBackground.title']()}
            desc={t['com.affine.core.appearanceSettings.noisyBackground.description']()}
          >
            <Switch
              checked={appSettings.enableNoisyBackground}
              onChange={checked =>
                changeSwitch('enableNoisyBackground', checked)
              }
            />
          </SettingRow>
          {environment.isMacOs && (
            <SettingRow
              name={t['com.affine.core.appearanceSettings.translucentUI.title']()}
              desc={t['com.affine.core.appearanceSettings.translucentUI.description']()}
            >
              <Switch
                checked={appSettings.enableBlurBackground}
                onChange={checked =>
                  changeSwitch('enableBlurBackground', checked)
                }
              />
            </SettingRow>
          )}
        </SettingWrapper>
      ) : null}
    </>
  );
};
