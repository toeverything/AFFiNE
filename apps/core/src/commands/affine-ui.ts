import { registerAffineCommand } from '@toeverything/infra/command';
import type { createStore } from 'jotai';

import { openQuickSearchModalAtom } from '../atoms';

export function registerAffineUiCommands({
  store,
}: {
  store: ReturnType<typeof createStore>;
}) {
  const unsubs: Array<() => void> = [];
  unsubs.push(
    registerAffineCommand({
      id: 'affine:show-quick-search',
      description: 'Show quick search modal',
      category: 'affine:ui',
      keyBinding: {
        binding: '$mod+K',
      },
      run() {
        store.set(openQuickSearchModalAtom, true);
      },
    })
  );

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}
