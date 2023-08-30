import type { ToastOptions } from '@affine/component';
import { toast as basicToast } from '@affine/component';
import { assertEquals, assertExists } from '@blocksuite/global/utils';
import { getCurrentStore } from '@toeverything/infra/atom';

import { mainContainerAtom } from '../atoms/element';

export const toast = (message: string, options?: ToastOptions) => {
  const mainContainer = getCurrentStore().get(mainContainerAtom);
  const modal = document.querySelector(
    '[role=presentation]'
  ) as HTMLDivElement | null;
  assertExists(mainContainer, 'main container should exist');
  if (modal) {
    assertEquals(modal.constructor, HTMLDivElement, 'modal should be div');
  }
  return basicToast(message, {
    portal: modal || mainContainer || document.body,
    ...options,
  });
};

declare global {
  // global Events
  interface WindowEventMap {
    'affine-toast:emit': CustomEvent<{
      message: string;
    }>;
  }
}
