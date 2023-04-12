import type { ToastOptions } from '@affine/component';
import { toast as basicToast } from '@affine/component';
import { DebugLogger } from '@affine/debug';

const logger = new DebugLogger('toast');

export const toast = (message: string, options?: ToastOptions) => {
  const mainContainer = document.querySelector(
    '.main-container'
  ) as HTMLElement;
  logger.debug(`toast with message: "${message}"`, options);
  return basicToast(message, {
    portal: mainContainer || document.body,
    ...options,
  });
};
