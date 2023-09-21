import type { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightBigIcon } from '@blocksuite/icons';
import type { Workspace } from '@blocksuite/store';
import { registerAffineCommand } from '@toeverything/infra/command';
import type { createStore } from 'jotai';

import { openSettingModalAtom } from '../atoms';
import type { useNavigateHelper } from '../hooks/use-navigate-helper';
import { WorkspaceSubPath } from '../shared';

export function registerAffineNavigationCommands({
  t,
  store,
  workspace,
  navigationHelper,
}: {
  t: ReturnType<typeof useAFFiNEI18N>;
  store: ReturnType<typeof createStore>;
  navigationHelper: ReturnType<typeof useNavigateHelper>;
  workspace: Workspace;
}) {
  const unsubs: Array<() => void> = [];
  unsubs.push(
    registerAffineCommand({
      id: 'affine:goto-all-pages',
      category: 'affine:navigation',
      icon: <ArrowRightBigIcon />,
      label: () => t['com.affine.cmdk.affine.navigation.goto-all-pages'](),
      run() {
        navigationHelper.jumpToSubPath(workspace.id, WorkspaceSubPath.ALL);
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: 'affine:open-settings',
      category: 'affine:navigation',
      icon: <ArrowRightBigIcon />,
      label: () => t['com.affine.cmdk.affine.navigation.open-settings'](),
      run() {
        store.set(openSettingModalAtom, {
          activeTab: 'appearance',
          workspaceId: null,
          open: true,
        });
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: 'affine:goto-trash',
      category: 'affine:navigation',
      icon: <ArrowRightBigIcon />,
      label: () => t['com.affine.cmdk.affine.navigation.goto-trash'](),
      run() {
        navigationHelper.jumpToSubPath(workspace.id, WorkspaceSubPath.TRASH);
      },
    })
  );

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}
