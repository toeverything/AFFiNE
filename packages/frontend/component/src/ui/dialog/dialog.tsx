import clsx from 'clsx';

import type { ConfirmModalProps, OpenConfirmModalOptions } from '../modal';
import { ConfirmModalInner } from './confirm-dialog';
import { confirmModalContainer } from './confirm-dialog.css';
import { dialogs$ } from './state';
import type { Dialog, DialogOptions } from './types';

let _internalId = 0;

/**
 * Create/Open a dialog
 */
export const dialog = (info: DialogOptions) => {
  const id = info.id ?? `internal:${_internalId++}`;
  dialogs$.next({
    [id]: {
      ...dialogs$.value[id],
      ...info,
      id,
      open: true,
    },
  });
  return id;
};

/**
 * Close specific dialog
 */
dialog.close = (id: Dialog['id']) => {
  if (id.startsWith('internal:')) {
    return dialog.destroy(id);
  }
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

dialog.update = (id: Dialog['id'], info: Partial<DialogOptions>) => {
  const _dialog = dialogs$.value[id];
  if (!_dialog) {
    throw new Error(`Dialog with id ${id} not found`);
  }
  dialogs$.next({
    ...dialogs$.value,
    [id]: {
      // TODO: merge deeply
      ..._dialog,
      ...info,
    },
  });
};

/**
 * Open confirm dialog
 * @returns
 */
dialog.confirm = (
  props: ConfirmModalProps & { id?: Dialog['id'] },
  options?: OpenConfirmModalOptions
) => {
  const { autoClose = true, onSuccess } = options ?? {};
  const { onConfirm: _onConfirm, width = 480, ...otherProps } = props;

  const setLoading = (value: boolean) => {
    dialog.confirm({
      id,
      ...props,
      confirmButtonOptions: {
        ...props.confirmButtonOptions,
        loading: value,
      },
    });
  };

  const onConfirm = () => {
    setLoading(true);
    return Promise.resolve(_onConfirm?.())
      .then(() => onSuccess?.())
      .catch(console.error)
      .finally(() => autoClose && dialog.close(id));
  };

  const id = dialog({
    ...props,
    width,
    contentOptions: {
      ...props.contentOptions,
      className: clsx(
        confirmModalContainer,
        props.confirmButtonOptions?.className
      ),
    },
    component: (
      <ConfirmModalInner onConfirm={onConfirm} {...otherProps}>
        {props.children}
      </ConfirmModalInner>
    ),
  });

  return id;
};
