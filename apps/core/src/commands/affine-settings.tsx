import type { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SettingsIcon } from '@blocksuite/icons';
import {
  PreconditionStrategy,
  registerAffineCommand,
} from '@toeverything/infra/command';
import type { createStore } from 'jotai';
import type { useTheme } from 'next-themes';

import { openQuickSearchModalAtom } from '../atoms';

export function registerAffineSettingsCommands({
  store,
  t,
  theme,
}: {
  t: ReturnType<typeof useAFFiNEI18N>;
  store: ReturnType<typeof createStore>;
  theme: ReturnType<typeof useTheme>;
}) {
  console.log('theme', theme);
  const unsubs: Array<() => void> = [];
  unsubs.push(
    registerAffineCommand({
      id: 'affine:show-quick-search',
      preconditionStrategy: PreconditionStrategy.Never,
      category: 'affine:general',
      keyBinding: {
        binding: '$mod+K',
      },
      icon: <SettingsIcon />,
      run() {
        store.set(openQuickSearchModalAtom, true);
      },
    })
  );

  // color schemes
  unsubs.push(
    registerAffineCommand({
      id: 'affine:change-color-scheme-to-auto',
      label: t['com.affine.cmdk.affine.color-scheme.to-auto'],
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
      label: t['com.affine.cmdk.affine.color-scheme.to-dark'],
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
      label: t['com.affine.cmdk.affine.color-scheme.to-light'],
      category: 'affine:settings',
      icon: <SettingsIcon />,
      preconditionStrategy: () => theme.theme !== 'light',
      run() {
        theme.setTheme('light');
      },
    })
  );

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}
