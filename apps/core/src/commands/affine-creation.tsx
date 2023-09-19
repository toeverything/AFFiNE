import { PlusIcon } from '@blocksuite/icons';
import { registerAffineCommand } from '@toeverything/infra/command';
import type { createStore } from 'jotai';

import type { usePageHelper } from '../components/blocksuite/block-suite-page-list/utils';

export function registerAffineCreationCommands({
  store,
  pageHelper,
}: {
  store: ReturnType<typeof createStore>;
  pageHelper: ReturnType<typeof usePageHelper>;
}) {
  const unsubs: Array<() => void> = [];
  unsubs.push(
    registerAffineCommand({
      id: 'affine:new-page',
      category: 'affine:ui',
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
      category: 'affine:ui',
      icon: <PlusIcon />,
      run() {
        pageHelper.createEdgeless();
      },
    })
  );

  unsubs.push(
    registerAffineCommand({
      id: 'affine:new-workspace',
      category: 'affine:ui',
      icon: <PlusIcon />,
      run() {
        store
      },
    })
  );

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}
