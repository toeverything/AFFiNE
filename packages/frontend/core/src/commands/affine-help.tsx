import type { useI18n } from '@affine/i18n';
import { ContactWithUsIcon, NewIcon } from '@blocksuite/icons/rc';
import type { createStore } from 'jotai';

import { openSettingModalAtom } from '../atoms';
import { popupWindow } from '../utils';
import { registerAffineCommand } from './registry';

export function registerAffineHelpCommands({
  t,
  store,
}: {
  t: ReturnType<typeof useI18n>;
  store: ReturnType<typeof createStore>;
}) {
  const unsubs: Array<() => void> = [];
  unsubs.push(
    registerAffineCommand({
      id: 'affine:help-whats-new',
      category: 'affine:help',
      icon: <NewIcon />,
      label: t['com.affine.cmdk.affine.whats-new'](),
      run() {
        popupWindow(runtimeConfig.changelogUrl);
      },
    })
  );
  unsubs.push(
    registerAffineCommand({
      id: 'affine:help-contact-us',
      category: 'affine:help',
      icon: <ContactWithUsIcon />,
      label: t['com.affine.cmdk.affine.contact-us'](),
      run() {
        store.set(openSettingModalAtom, {
          open: true,
          activeTab: 'about',
          workspaceMetadata: null,
        });
      },
    })
  );

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}
