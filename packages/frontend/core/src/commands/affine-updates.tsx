import { updateReadyAtom } from '@affine/core/hooks/use-app-updater';
import { apis } from '@affine/electron-api';
import type { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ResetIcon } from '@blocksuite/icons';
import { registerAffineCommand } from '@toeverything/infra';
import type { createStore } from 'jotai';

export function registerAffineUpdatesCommands({
  t,
  store,
}: {
  t: ReturnType<typeof useAFFiNEI18N>;
  store: ReturnType<typeof createStore>;
}) {
  const unsubs: Array<() => void> = [];

  unsubs.push(
    registerAffineCommand({
      id: 'affine:restart-to-upgrade',
      category: 'affine:updates',
      icon: <ResetIcon />,
      label: t['com.affine.cmdk.affine.restart-to-upgrade'](),
      preconditionStrategy: () => !!store.get(updateReadyAtom),
      run() {
        apis?.updater.quitAndInstall().catch(err => {
          // TODO: add error toast here
          console.error(err);
        });
      },
    })
  );

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}
