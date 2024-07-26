import { Modal } from '@affine/component';
import { useMount } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useCallback, useEffect, useState } from 'react';

import type { BaseSelectorDialogProps } from '.';

export const useSelectDialog = function useSelectDialog<T>(
  Component: React.FC<BaseSelectorDialogProps<T>>,
  debugKey?: string
) {
  // to control whether the dialog is open, it's not equal to !!value
  // when closing the dialog, show will be `false` first, then after the animation, value turns to `undefined`
  const [show, setShow] = useState(false);
  const [value, setValue] = useState<{
    init?: T;
    onConfirm: (v: T) => void;
  }>();

  const onOpenChanged = useCallback((open: boolean) => {
    if (!open) setValue(undefined);
    setShow(open);
  }, []);

  const close = useCallback(() => setShow(false), []);

  /**
   * Open a dialog to select items
   */
  const open = useCallback(
    (ids?: T) => {
      return new Promise<T>(resolve => {
        setShow(true);
        setValue({
          init: ids,
          onConfirm: list => {
            close();
            resolve(list);
          },
        });
      });
    },
    [close]
  );

  const { mount } = useMount(debugKey);

  useEffect(() => {
    return mount(
      <Modal
        open={show}
        onOpenChange={onOpenChanged}
        withoutCloseButton
        width="calc(100% - 32px)"
        height="80%"
        contentOptions={{
          style: {
            padding: 0,
            maxWidth: 976,
            background: cssVar('backgroundPrimaryColor'),
          },
        }}
      >
        {value ? (
          <Component
            init={value.init}
            onCancel={close}
            onConfirm={value.onConfirm}
          />
        ) : null}
      </Modal>
    );
  }, [Component, close, mount, onOpenChanged, show, value]);

  return open;
};
