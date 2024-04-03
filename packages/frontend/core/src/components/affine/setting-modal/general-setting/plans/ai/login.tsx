import { Button } from '@affine/component';
import { authAtom } from '@affine/core/atoms';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

export const AILogin = () => {
  const setOpen = useSetAtom(authAtom);

  const onClickSignIn = useCallback(() => {
    setOpen(state => ({
      ...state,
      openModal: true,
    }));
  }, [setOpen]);

  return <Button onClick={onClickSignIn}>Login</Button>;
};
