import type { ToastOptions } from '@affine/component';
import { toast as basicToast } from '@affine/component';
import { assertEquals } from '@blocksuite/affine/global/utils';

export const toast = (message: string, options?: ToastOptions) => {
  const modal = document.querySelector(
    '[role=presentation]'
  ) as HTMLDivElement | null;
  if (modal) {
    assertEquals(modal.constructor, HTMLDivElement, 'modal should be div');
  }
  return basicToast(message, {
    portal: modal || document.body,
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
