import type { useAFFiNEI18N } from '@affine/i18n/hooks';
import { PlusIcon } from '@blocksuite/icons';
import { registerAffineCommand } from '@toeverything/infra/command';
import type { createStore } from 'jotai';

import type { usePageHelper } from '../components/blocksuite/block-suite-page-list/utils';

export function registerAffineCreationCommands({
  store,
  pageHelper,
  t,
}: {
  t: ReturnType<typeof useAFFiNEI18N>;
  store: ReturnType<typeof createStore>;
  pageHelper: ReturnType<typeof usePageHelper>;
}) {
  const unsubs: Array<() => void> = [];
  unsubs.push(
    registerAffineCommand({
      id: 'affine:new-page',
      category: 'affine:creation',
      label: t['com.affine.cmdk.affine.new-page'],
      icon: <PlusIcon />,
      keyBinding: {
        // this only works for Desktop app
        binding: '$mod+N',
      },
      run() {
        pageHelper.createPage();
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: 'affine:new-edgeless-page',
      category: 'affine:creation',
      icon: <PlusIcon />,
      label: t['com.affine.cmdk.affine.new-edgeless-page'],
      run() {
        pageHelper.createEdgeless();
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: 'affine:new-workspace',
      category: 'affine:creation',
      icon: <PlusIcon />,
      label: t['com.affine.cmdk.affine.new-workspace'],
      run() {
        store;
      },
    })
  );

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}
