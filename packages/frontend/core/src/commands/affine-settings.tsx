import type { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { SettingsIcon } from '@blocksuite/icons/rc';
import { appSettingAtom } from '@toeverything/infra';
import type { createStore } from 'jotai';
import type { useTheme } from 'next-themes';

import type { EditorSettingService } from '../modules/editor-settting';
import { registerAffineCommand } from './registry';

export function registerAffineSettingsCommands({
  t,
  store,
  theme,
  editorSettingService,
}: {
  t: ReturnType<typeof useI18n>;
  store: ReturnType<typeof createStore>;
  theme: ReturnType<typeof useTheme>;
  editorSettingService: EditorSettingService;
}) {
  const unsubs: Array<() => void> = [];
  const updateSettings = editorSettingService.editorSetting.set.bind(
    editorSettingService.editorSetting
  );
  const settings$ = editorSettingService.editorSetting.settings$;

  // color modes
  unsubs.push(
    registerAffineCommand({
      id: 'affine:change-color-mode-to-auto',
      label: `${t['com.affine.cmdk.affine.color-mode.to']()} ${t[
        'com.affine.themeSettings.system'
      ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => theme.theme !== 'system',
      run() {
        track.$.cmdk.settings.changeAppSetting({
          key: 'theme',
          value: 'system',
        });
        theme.setTheme('system');
      },
    })
  );
  unsubs.push(
    registerAffineCommand({
      id: 'affine:change-color-mode-to-dark',
      label: `${t['com.affine.cmdk.affine.color-mode.to']()} ${t[
        'com.affine.themeSettings.dark'
      ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => theme.theme !== 'dark',
      run() {
        track.$.cmdk.settings.changeAppSetting({
          key: 'theme',
          value: 'dark',
        });
        theme.setTheme('dark');
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: 'affine:change-color-mode-to-light',
      label: `${t['com.affine.cmdk.affine.color-mode.to']()} ${t[
        'com.affine.themeSettings.light'
      ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => theme.theme !== 'light',
      run() {
        track.$.cmdk.settings.changeAppSetting({
          key: 'theme',
          value: 'light',
        });

        theme.setTheme('light');
      },
    })
  );

  // Font styles
  unsubs.push(
    registerAffineCommand({
      id: 'affine:change-font-style-to-sans',
      label: `${t['com.affine.cmdk.affine.font-style.to']()} ${t[
        'com.affine.appearanceSettings.fontStyle.sans'
      ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => settings$.value.fontFamily !== 'Sans',
      run() {
        track.$.cmdk.settings.changeAppSetting({
          key: 'fontStyle',
          value: 'Sans',
        });

        updateSettings('fontFamily', 'Sans');
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: 'affine:change-font-style-to-serif',
      label: `${t['com.affine.cmdk.affine.font-style.to']()} ${t[
        'com.affine.appearanceSettings.fontStyle.serif'
      ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => settings$.value.fontFamily !== 'Serif',
      run() {
        track.$.cmdk.settings.changeAppSetting({
          key: 'fontStyle',
          value: 'Serif',
        });

        updateSettings('fontFamily', 'Serif');
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: 'affine:change-font-style-to-mono',
      label: `${t['com.affine.cmdk.affine.font-style.to']()} ${t[
        'com.affine.appearanceSettings.fontStyle.mono'
      ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => settings$.value.fontFamily !== 'Mono',
      run() {
        track.$.cmdk.settings.changeAppSetting({
          key: 'fontStyle',
          value: 'Mono',
        });

        updateSettings('fontFamily', 'Mono');
      },
    })
  );

  // Layout Style
  unsubs.push(
    registerAffineCommand({
      id: `affine:change-client-border-style`,
      label: () => `${t['com.affine.cmdk.affine.client-border-style.to']()} ${t[
        store.get(appSettingAtom).clientBorder
          ? 'com.affine.cmdk.affine.switch-state.off'
          : 'com.affine.cmdk.affine.switch-state.on'
      ]()}
        `,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => BUILD_CONFIG.isElectron,
      run() {
        track.$.cmdk.settings.changeAppSetting({
          key: 'clientBorder',
          value: store.get(appSettingAtom).clientBorder ? 'off' : 'on',
        });
        store.set(appSettingAtom, prev => ({
          ...prev,
          clientBorder: !prev.clientBorder,
        }));
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: `affine:change-full-width-layout`,
      label: () =>
        `${t['com.affine.cmdk.affine.full-width-layout.to']()} ${t[
          settings$.value.fullWidthLayout
            ? 'com.affine.cmdk.affine.switch-state.off'
            : 'com.affine.cmdk.affine.switch-state.on'
        ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      run() {
        track.$.cmdk.settings.changeAppSetting({
          key: 'fullWidthLayout',
          value: settings$.value.fullWidthLayout ? 'off' : 'on',
        });
        updateSettings('fullWidthLayout', !settings$.value.fullWidthLayout);
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: `affine:change-noise-background-on-the-sidebar`,
      label: () =>
        `${t[
          'com.affine.cmdk.affine.noise-background-on-the-sidebar.to'
        ]()} ${t[
          store.get(appSettingAtom).enableNoisyBackground
            ? 'com.affine.cmdk.affine.switch-state.off'
            : 'com.affine.cmdk.affine.switch-state.on'
        ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => BUILD_CONFIG.isElectron,
      run() {
        track.$.cmdk.settings.changeAppSetting({
          key: 'enableNoisyBackground',
          value: store.get(appSettingAtom).enableNoisyBackground ? 'off' : 'on',
        });

        store.set(appSettingAtom, prev => ({
          ...prev,
          enableNoisyBackground: !prev.enableNoisyBackground,
        }));
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: `affine:change-translucent-ui-on-the-sidebar`,
      label: () =>
        `${t['com.affine.cmdk.affine.translucent-ui-on-the-sidebar.to']()} ${t[
          store.get(appSettingAtom).enableBlurBackground
            ? 'com.affine.cmdk.affine.switch-state.off'
            : 'com.affine.cmdk.affine.switch-state.on'
        ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () =>
        BUILD_CONFIG.isElectron && environment.isMacOs,
      run() {
        track.$.cmdk.settings.changeAppSetting({
          key: 'enableBlurBackground',
          value: store.get(appSettingAtom).enableBlurBackground ? 'off' : 'on',
        });
        store.set(appSettingAtom, prev => ({
          ...prev,
          enableBlurBackground: !prev.enableBlurBackground,
        }));
      },
    })
  );

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}
