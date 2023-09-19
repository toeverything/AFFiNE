import { appSidebarOpenAtom } from '@affine/component/app-sidebar';
import { SidebarIcon } from '@blocksuite/icons';
import { registerAffineCommand } from '@toeverything/infra/command';
import type { createStore } from 'jotai';

export function registerAffineLayoutCommands({
  store,
}: {
  store: ReturnType<typeof createStore>;
}) {
  const unsubs: Array<() => void> = [];
  unsubs.push(
    registerAffineCommand({
      id: 'affine:toggle-left-sidebar',
      category: 'affine:ui',
      icon: <SidebarIcon />,
      keyBinding: {
        // this only works for Desktop app
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
