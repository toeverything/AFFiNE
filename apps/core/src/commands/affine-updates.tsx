import { updateReadyAtom } from '@affine/component/app-sidebar/app-updater-button/index.jotai';
import type { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ResetIcon } from '@blocksuite/icons';
import { registerAffineCommand } from '@toeverything/infra/command';
import type { createStore } from 'jotai';

export function registerAffineUpdatesCommands({
  t,
  store,
}: {
  t: ReturnType<typeof useAFFiNEI18N>;
  store: ReturnType<typeof createStore>;
}) {
  const unsubs: Array<() => void> = [];
  const updateReady = store.get(updateReadyAtom);
  unsubs.push(
    registerAffineCommand({
      id: 'affine:restart-to-upgrade',
      category: 'affine:updates',
      icon: <ResetIcon />,
      label: () => t['com.affine.cmdk.affine.restart-to-upgrade'](),
      preconditionStrategy: () => !!updateReady,
      run() {
        window.apis?.updater.quitAndInstall().catch(err => {
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
