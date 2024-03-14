import { WorkspaceSubPath } from '@affine/core/shared';
import type { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightBigIcon } from '@blocksuite/icons';
import type { DocCollection } from '@blocksuite/store';
import { registerAffineCommand } from '@toeverything/infra/command';
import type { createStore } from 'jotai';

import { openSettingModalAtom, openWorkspaceListModalAtom } from '../atoms';
import type { useNavigateHelper } from '../hooks/use-navigate-helper';

export function registerAffineNavigationCommands({
  t,
  store,
  docCollection,
  navigationHelper,
}: {
  t: ReturnType<typeof useAFFiNEI18N>;
  store: ReturnType<typeof createStore>;
  navigationHelper: ReturnType<typeof useNavigateHelper>;
  docCollection: DocCollection;
}) {
  const unsubs: Array<() => void> = [];
  unsubs.push(
    registerAffineCommand({
      id: 'affine:goto-all-pages',
      category: 'affine:navigation',
      icon: <ArrowRightBigIcon />,
      label: t['com.affine.cmdk.affine.navigation.goto-all-pages'](),
      run() {
        navigationHelper.jumpToSubPath(docCollection.id, WorkspaceSubPath.ALL);
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: 'affine:goto-collection-list',
      category: 'affine:navigation',
      icon: <ArrowRightBigIcon />,
      label: 'Go to Collection List',
      run() {
        navigationHelper.jumpToCollections(docCollection.id);
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: 'affine:goto-tag-list',
      category: 'affine:navigation',
      icon: <ArrowRightBigIcon />,
      label: 'Go to Tag List',
      run() {
        navigationHelper.jumpToTags(docCollection.id);
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: 'affine:goto-workspace',
      category: 'affine:navigation',
      icon: <ArrowRightBigIcon />,
      label: t['com.affine.cmdk.affine.navigation.goto-workspace'](),
      run() {
        store.set(openWorkspaceListModalAtom, true);
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: 'affine:open-settings',
      category: 'affine:navigation',
      icon: <ArrowRightBigIcon />,
      label: t['com.affine.cmdk.affine.navigation.open-settings'](),
      keyBinding: '$mod+,',
      run() {
        store.set(openSettingModalAtom, s => ({
          activeTab: 'appearance',
          open: !s.open,
        }));
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: 'affine:goto-trash',
      category: 'affine:navigation',
      icon: <ArrowRightBigIcon />,
      label: t['com.affine.cmdk.affine.navigation.goto-trash'](),
      run() {
        navigationHelper.jumpToSubPath(
          docCollection.id,
          WorkspaceSubPath.TRASH
        );
      },
    })
  );

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}
