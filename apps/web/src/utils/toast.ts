import type { ToastOptions } from '@affine/component';
import { toast as basicToast } from '@affine/component';
import { DebugLogger } from '@affine/debug';

const logger = new DebugLogger('toast');

export const toast = (message: string, options?: ToastOptions) => {
  const mainContainer = document.querySelector(
    '.main-container'
  ) as HTMLElement;
  logger.debug(`toast with message: "${message}"`, options);
  window.dispatchEvent(
    new CustomEvent('affine-toast:emit', { detail: message })
  );
  return basicToast(message, {
    portal: mainContainer || document.body,
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
