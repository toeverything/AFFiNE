import {
  PreconditionStrategy,
  registerAffineCommand,
} from '@affine/core/commands';
import { track } from '@affine/core/mixpanel';
import { FindInPageService } from '@affine/core/modules/find-in-page/services/find-in-page';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect } from 'react';

export function useRegisterFindInPageCommands() {
  const findInPage = useService(FindInPageService).findInPage;
  const toggleVisible = useCallback(() => {
    // get the selected text in page
    const selection = window.getSelection();
    const selectedText = selection?.toString();

    findInPage.toggleVisible(selectedText);
  }, [findInPage]);

  useEffect(() => {
    if (!BUILD_CONFIG.isElectron) {
      return;
    }
    const unsubs: Array<() => void> = [];
    unsubs.push(
      registerAffineCommand({
        preconditionStrategy: PreconditionStrategy.Never,
        id: `affine:find-in-page`,
        keyBinding: {
          binding: '$mod+f',
        },
        icon: null,
        label: '',
        run() {
          track.$.cmdk.general.findInPage();

          toggleVisible();
        },
      })
    );

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [toggleVisible]);
}
