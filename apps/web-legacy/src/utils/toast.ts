import type { ToastOptions } from '@affine/component';
import { toast as basicToast } from '@affine/component';

export const toast = (message: string, options?: ToastOptions) => {
  const mainContainer = document.querySelector(
    '.main-container'
  ) as HTMLElement;
  return basicToast(message, {
    portal: mainContainer || document.body,
    ...options,
  });
};
