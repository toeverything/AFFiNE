import { dialogs$ } from './state';
import type { Dialog, DialogOptions } from './types';

let _internalId = 0;

/**
 * Create/Open a dialog
 */
export const dialog = (info: DialogOptions) => {
  const id = info.id ?? `${_internalId++}`;
  dialogs$.next({
    [id]: {
      ...dialogs$.value[id],
      ...info,
      id,
      open: true,
    },
  });
};

/**
 * Close specific dialog
 */
dialog.close = (id: Dialog['id']) => {
  dialogs$.next({
    ...dialogs$.value,
    [id]: { ...dialogs$.value[id], open: false },
  });
};

/**
 * Destroy specific dialog
 */
dialog.destroy = (id: Dialog['id']) => {
  const { [id]: _, ...rest } = dialogs$.value;
  dialogs$.next(rest);
};

// TODO: impl dialog.confirm
