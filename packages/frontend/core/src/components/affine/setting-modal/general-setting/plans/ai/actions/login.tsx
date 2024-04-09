import { Button, type ButtonProps } from '@affine/component';
import { authAtom } from '@affine/core/atoms';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import type { BaseActionProps } from '../types';

export const AILogin = (btnProps: BaseActionProps & ButtonProps) => {
  const setOpen = useSetAtom(authAtom);

  const onClickSignIn = useCallback(() => {
    setOpen(state => ({
      ...state,
      openModal: true,
    }));
  }, [setOpen]);

  return (
    <Button onClick={onClickSignIn} type="primary" {...btnProps}>
      Login
    </Button>
  );
};
