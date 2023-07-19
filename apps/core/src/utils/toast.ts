import type { ToastOptions } from '@affine/component';
import { toast as basicToast } from '@affine/component';

export const toast = (message: string, options?: ToastOptions) => {
  const modal = document.querySelector(
    '[role=presentation]'
  ) as HTMLElement | null;
  const mainContainer = document.querySelector(
    '.main-container'
  ) as HTMLElement | null;
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
