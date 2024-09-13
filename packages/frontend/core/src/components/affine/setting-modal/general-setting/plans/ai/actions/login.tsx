import { Button, type ButtonProps } from '@affine/component';
import { authAtom } from '@affine/core/components/atoms';
import { useI18n } from '@affine/i18n';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

export const AILogin = (btnProps: ButtonProps) => {
  const t = useI18n();
  const setOpen = useSetAtom(authAtom);

  const onClickSignIn = useCallback(() => {
    setOpen(state => ({
      ...state,
      openModal: true,
    }));
  }, [setOpen]);

  return (
    <Button onClick={onClickSignIn} variant="primary" {...btnProps}>
      {t['com.affine.payment.ai.action.login.button-label']()}
    </Button>
  );
};
