import type { useI18n } from '@affine/i18n';
import { SidebarIcon } from '@blocksuite/icons/rc';
import type { createStore } from 'jotai';

import { appSidebarOpenAtom } from '../components/app-sidebar';
import { track } from '../mixpanel';
import { registerAffineCommand } from './registry';

export function registerAffineLayoutCommands({
  t,
  store,
}: {
  t: ReturnType<typeof useI18n>;
  store: ReturnType<typeof createStore>;
}) {
  const unsubs: Array<() => void> = [];
  unsubs.push(
    registerAffineCommand({
      id: 'affine:toggle-left-sidebar',
      category: 'affine:layout',
      icon: <SidebarIcon />,
      label: () =>
        store.get(appSidebarOpenAtom)
          ? t['com.affine.cmdk.affine.left-sidebar.collapse']()
          : t['com.affine.cmdk.affine.left-sidebar.expand'](),

      keyBinding: {
        binding: '$mod+/',
      },
      run() {
        track.$.navigationPanel.$.toggle();

        store.set(appSidebarOpenAtom, v => !v);
      },
    })
  );

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}
