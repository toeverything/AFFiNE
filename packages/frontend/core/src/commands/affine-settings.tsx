import type { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SettingsIcon } from '@blocksuite/icons';
import {
  PreconditionStrategy,
  registerAffineCommand,
} from '@toeverything/infra/command';
import { type createStore } from 'jotai';
import type { useTheme } from 'next-themes';

import { openQuickSearchModalAtom } from '../atoms';
import type { useAppSettingHelper } from '../hooks/affine/use-app-setting-helper';
import type { useLanguageHelper } from '../hooks/affine/use-language-helper';

export function registerAffineSettingsCommands({
  t,
  store,
  theme,
  languageHelper,
  appSettingHelper,
}: {
  t: ReturnType<typeof useAFFiNEI18N>;
  store: ReturnType<typeof createStore>;
  theme: ReturnType<typeof useTheme>;
  languageHelper: ReturnType<typeof useLanguageHelper>;
  appSettingHelper: ReturnType<typeof useAppSettingHelper>;
}) {
  const unsubs: Array<() => void> = [];
  const { onSelect, languagesList, currentLanguage } = languageHelper;
  const { appSettings, updateSettings } = appSettingHelper;
  const {
    clientBorder,
    enableBlurBackground,
    enableNoisyBackground,
    fullWidthLayout,
    fontStyle,
  } = appSettings;
  unsubs.push(
    registerAffineCommand({
      id: 'affine:show-quick-search',
      preconditionStrategy: PreconditionStrategy.Never,
      category: 'affine:general',
      keyBinding: {
        binding: '$mod+K',
      },
      label: '',
      icon: <SettingsIcon />,
      run() {
        const quickSearchModalState = store.get(openQuickSearchModalAtom);
        store.set(openQuickSearchModalAtom, !quickSearchModalState);
      },
    })
  );

  // color schemes
  unsubs.push(
    registerAffineCommand({
      id: 'affine:change-color-scheme-to-auto',
      label: `${t['com.affine.cmdk.affine.color-scheme.to']()} ${t[
        'com.affine.themeSettings.system'
      ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => theme.theme !== 'system',
      run() {
        theme.setTheme('system');
      },
    })
  );
  unsubs.push(
    registerAffineCommand({
      id: 'affine:change-color-scheme-to-dark',
      label: `${t['com.affine.cmdk.affine.color-scheme.to']()} ${t[
        'com.affine.themeSettings.dark'
      ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => theme.theme !== 'dark',
      run() {
        theme.setTheme('dark');
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: 'affine:change-color-scheme-to-light',
      label: `${t['com.affine.cmdk.affine.color-scheme.to']()} ${t[
        'com.affine.themeSettings.light'
      ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => theme.theme !== 'light',
      run() {
        theme.setTheme('light');
      },
    })
  );

  //Font styles
  unsubs.push(
    registerAffineCommand({
      id: 'affine:change-font-style-to-sans',
      label: `${t['com.affine.cmdk.affine.font-style.to']()} ${t[
        'com.affine.appearanceSettings.fontStyle.sans'
      ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => fontStyle !== 'Sans',
      run() {
        updateSettings('fontStyle', 'Sans');
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
      preconditionStrategy: () => fontStyle !== 'Serif',
      run() {
        updateSettings('fontStyle', 'Serif');
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
      preconditionStrategy: () => fontStyle !== 'Mono',
      run() {
        updateSettings('fontStyle', 'Mono');
      },
    })
  );

  //Display Language
  languagesList.forEach(language => {
    unsubs.push(
      registerAffineCommand({
        id: `affine:change-display-language-to-${language.name}`,
        label: `${t['com.affine.cmdk.affine.display-language.to']()} ${
          language.originalName
        }`,
        category: 'affine:settings',
        icon: <SettingsIcon />,
        preconditionStrategy: () => currentLanguage?.tag !== language.tag,
        run() {
          onSelect(language.tag);
        },
      })
    );
  });

  //Layout Style
  unsubs.push(
    registerAffineCommand({
      id: `affine:change-client-border-style`,
      label: `${t['com.affine.cmdk.affine.client-border-style.to']()} ${t[
        clientBorder
          ? 'com.affine.cmdk.affine.switch-state.off'
          : 'com.affine.cmdk.affine.switch-state.on'
      ]()}
        `,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => environment.isDesktop,
      run() {
        updateSettings('clientBorder', !clientBorder);
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: `affine:change-full-width-layout`,
      label: `${t['com.affine.cmdk.affine.full-width-layout.to']()} ${t[
        fullWidthLayout
          ? 'com.affine.cmdk.affine.switch-state.off'
          : 'com.affine.cmdk.affine.switch-state.on'
      ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      run() {
        updateSettings('fullWidthLayout', !fullWidthLayout);
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: `affine:change-noise-background-on-the-sidebar`,
      label: `${t[
        'com.affine.cmdk.affine.noise-background-on-the-sidebar.to'
      ]()} ${t[
        enableNoisyBackground
          ? 'com.affine.cmdk.affine.switch-state.off'
          : 'com.affine.cmdk.affine.switch-state.on'
      ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => environment.isDesktop,
      run() {
        updateSettings('enableNoisyBackground', !enableNoisyBackground);
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: `affine:change-translucent-ui-on-the-sidebar`,
      label: `${t[
        'com.affine.cmdk.affine.translucent-ui-on-the-sidebar.to'
      ]()} ${t[
        enableBlurBackground
          ? 'com.affine.cmdk.affine.switch-state.off'
          : 'com.affine.cmdk.affine.switch-state.on'
      ]()}`,
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => environment.isDesktop,
      run() {
        updateSettings('enableBlurBackground', !enableBlurBackground);
      },
    })
  );

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}
