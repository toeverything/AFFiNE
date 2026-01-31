import type { RadioItem } from '@affine/component';
import { RadioGroup, Switch } from '@affine/component';
import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { LanguageMenu } from '@affine/core/components/affine/language-menu';
import { TraySettingService } from '@affine/core/modules/editor-setting/services/tray-settings';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useTheme } from 'next-themes';
import { useCallback, useMemo } from 'react';

import { useAppSettingHelper } from '../../../../../components/hooks/affine/use-app-setting-helper';
import { OpenInAppLinksMenu } from './links';
import { settingWrapper } from './style.css';
import { ThemeEditorSetting } from './theme-editor-setting';

export const getThemeOptions = (t: ReturnType<typeof useI18n>) =>
  [
    {
      value: 'system',
      label: t['com.affine.themeSettings.system'](),
      testId: 'system-theme-trigger',
    },
    {
      value: 'light',
      label: t['com.affine.themeSettings.light'](),
      testId: 'light-theme-trigger',
    },
    {
      value: 'dark',
      label: t['com.affine.themeSettings.dark'](),
      testId: 'dark-theme-trigger',
    },
  ] satisfies RadioItem[];

export const ThemeSettings = () => {
  const t = useI18n();
  const { setTheme, theme } = useTheme();

  const radioItems = useMemo<RadioItem[]>(() => getThemeOptions(t), [t]);

  return (
    <RadioGroup
      items={radioItems}
      value={theme}
      width={250}
      className={settingWrapper}
      onChange={useCallback(
        (value: string) => {
          setTheme(value);
        },
        [setTheme]
      )}
    />
  );
};

const MenubarSetting = () => {
  const t = useI18n();
  const traySettingService = useService(TraySettingService);
  const traySetting = useLiveData(traySettingService.settings$);

  return (
    <>
      <SettingWrapper
        id="menubar"
        title={t['com.affine.appearanceSettings.menubar.title']()}
      >
        <SettingRow
          name={t['com.affine.appearanceSettings.menubar.toggle']()}
          desc={t['com.affine.appearanceSettings.menubar.description']()}
        >
          <Switch
            checked={traySetting.enabled}
            onChange={checked => traySettingService.setEnabled(checked)}
          />
        </SettingRow>
      </SettingWrapper>
      {traySetting.enabled && !environment.isMacOs ? (
        <SettingWrapper
          id="windowBehavior"
          title={t[
            'com.affine.appearanceSettings.menubar.windowBehavior.title'
          ]()}
        >
          <SettingRow
            name={t[
              'com.affine.appearanceSettings.menubar.windowBehavior.openOnLeftClick.toggle'
            ]()}
            desc={t[
              'com.affine.appearanceSettings.menubar.windowBehavior.openOnLeftClick.description'
            ]()}
          >
            <Switch
              checked={traySetting.openOnLeftClick}
              onChange={checked =>
                traySettingService.setOpenOnLeftClick(checked)
              }
            />
          </SettingRow>
          <SettingRow
            name={t[
              'com.affine.appearanceSettings.menubar.windowBehavior.minimizeToTray.toggle'
            ]()}
            desc={t[
              'com.affine.appearanceSettings.menubar.windowBehavior.minimizeToTray.description'
            ]()}
          >
            <Switch
              checked={traySetting.minimizeToTray}
              onChange={checked =>
                traySettingService.setMinimizeToTray(checked)
              }
            />
          </SettingRow>
          <SettingRow
            name={t[
              'com.affine.appearanceSettings.menubar.windowBehavior.closeToTray.toggle'
            ]()}
            desc={t[
              'com.affine.appearanceSettings.menubar.windowBehavior.closeToTray.description'
            ]()}
          >
            <Switch
              checked={traySetting.closeToTray}
              onChange={checked => traySettingService.setCloseToTray(checked)}
            />
          </SettingRow>
          <SettingRow
            name={t[
              'com.affine.appearanceSettings.menubar.windowBehavior.startMinimized.toggle'
            ]()}
            desc={t[
              'com.affine.appearanceSettings.menubar.windowBehavior.startMinimized.description'
            ]()}
          >
            <Switch
              checked={traySetting.startMinimized}
              onChange={checked =>
                traySettingService.setStartMinimized(checked)
              }
            />
          </SettingRow>
        </SettingWrapper>
      ) : null}
    </>
  );
};

export const AppearanceSettings = () => {
  const t = useI18n();

  const featureFlagService = useService(FeatureFlagService);
  const enableThemeEditor = useLiveData(
    featureFlagService.flags.enable_theme_editor.$
  );
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
          name={t['com.affine.appearanceSettings.language.title']()}
          desc={t['com.affine.appearanceSettings.language.description']()}
        >
          <div className={settingWrapper}>
            <LanguageMenu />
          </div>
        </SettingRow>
        {BUILD_CONFIG.isElectron ? (
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
        {enableThemeEditor ? <ThemeEditorSetting /> : null}
      </SettingWrapper>

      <SettingWrapper title={t['com.affine.appearanceSettings.images.title']()}>
        <SettingRow
          name={t['com.affine.appearanceSettings.images.antialiasing.title']()}
          desc={t[
            'com.affine.appearanceSettings.images.antialiasing.description'
          ]()}
          data-testid="image-antialiasing-trigger"
        >
          <Switch
            checked={!appSettings.disableImageAntialiasing}
            onChange={checked =>
              updateSettings('disableImageAntialiasing', !checked)
            }
          />
        </SettingRow>
      </SettingWrapper>

      {BUILD_CONFIG.isWeb && !environment.isMobile ? (
        <SettingWrapper title={t['com.affine.setting.appearance.links']()}>
          <SettingRow
            name={t['com.affine.setting.appearance.open-in-app']()}
            desc={t['com.affine.setting.appearance.open-in-app.hint']()}
            data-testid="open-in-app-links-trigger"
          >
            <OpenInAppLinksMenu />
          </SettingRow>
        </SettingWrapper>
      ) : null}

      <SettingWrapper
        title={t['com.affine.appearanceSettings.sidebar.title']()}
      >
        {BUILD_CONFIG.isElectron ? (
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
        ) : null}
        {BUILD_CONFIG.isElectron && environment.isMacOs && (
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
        )}
        <SettingRow
          name={t[
            'com.affine.appearanceSettings.showLinkedDocInSidebar.title'
          ]()}
          desc={t[
            'com.affine.appearanceSettings.showLinkedDocInSidebar.description'
          ]()}
        >
          <Switch
            checked={!!appSettings.showLinkedDocInSidebar}
            onChange={checked =>
              updateSettings('showLinkedDocInSidebar', checked)
            }
          />
        </SettingRow>
      </SettingWrapper>

      {BUILD_CONFIG.isElectron ? <MenubarSetting /> : null}
    </>
  );
};
