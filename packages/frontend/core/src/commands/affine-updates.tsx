import { notify } from '@affine/component';
import { updateReadyAtom } from '@affine/core/components/hooks/use-app-updater';
import { apis } from '@affine/electron-api';
import type { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { ResetIcon } from '@blocksuite/icons/rc';
import type { createStore } from 'jotai';

import { registerAffineCommand } from './registry';

export function registerAffineUpdatesCommands({
  t,
  store,
}: {
  t: ReturnType<typeof useI18n>;
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
        track.$.cmdk.updates.quitAndInstall();

        apis?.updater.quitAndInstall().catch(err => {
          notify.error({
            title: 'Failed to restart to upgrade',
            message: 'Please restart the app manually to upgrade.',
          });
          console.error(err);
        });
      },
    })
  );

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}
