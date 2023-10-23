import type { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SidebarIcon } from '@blocksuite/icons';
import { registerAffineCommand } from '@toeverything/infra/command';

import type { useSidebarStatus } from '../hooks/affine/use-sidebar-status';

export function registerAffineLayoutCommands({
  t,
  sidebarStatus,
}: {
  t: ReturnType<typeof useAFFiNEI18N>;
  sidebarStatus: ReturnType<typeof useSidebarStatus>;
}) {
  const unsubs: Array<() => void> = [];
  const { isOpened, onOpenChange } = sidebarStatus;
  unsubs.push(
    registerAffineCommand({
      id: 'affine:toggle-left-sidebar-collapse',
      category: 'affine:layout',
      icon: <SidebarIcon />,
      label:
        t[
          isOpened
            ? 'com.affine.cmdk.affine.left-sidebar.collapse'
            : 'com.affine.cmdk.affine.left-sidebar.expand'
        ](),
      keyBinding: {
        binding: '$mod+/',
      },
      run() {
        onOpenChange();
      },
    })
  );

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}
