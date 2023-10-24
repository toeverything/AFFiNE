import { appSidebarOpenAtom } from '@affine/component/app-sidebar';
import type { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SidebarIcon } from '@blocksuite/icons';
import { registerAffineCommand } from '@toeverything/infra/command';
import type { createStore } from 'jotai';

export function registerAffineLayoutCommands({
  t,
  store,
}: {
  t: ReturnType<typeof useAFFiNEI18N>;
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
        store.set(appSidebarOpenAtom, v => !v);
      },
    })
  );

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}
