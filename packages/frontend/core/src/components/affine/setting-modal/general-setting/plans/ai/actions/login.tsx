import { Button, type ButtonProps } from '@affine/component';
import { authAtom } from '@affine/core/atoms';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import type { BaseActionProps } from '../types';

export const AILogin = (btnProps: BaseActionProps & ButtonProps) => {
  const t = useAFFiNEI18N();
  const setOpen = useSetAtom(authAtom);

  const onClickSignIn = useCallback(() => {
    setOpen(state => ({
      ...state,
      openModal: true,
    }));
  }, [setOpen]);

  return (
    <Button onClick={onClickSignIn} type="primary" {...btnProps}>
      {t['com.affine.payment.ai.action.login.button-label']()}
    </Button>
  );
};
