import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  ConfirmModal,
  type ConfirmModalProps,
} from '@toeverything/components/modal';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { authAtom } from '../../../atoms';
import { setOnceSignedInEventAtom } from '../../../atoms/event';
import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';

export const EnableAffineCloudModal = ({
  onConfirm: propsOnConfirm,
  ...props
}: ConfirmModalProps) => {
  const t = useAFFiNEI18N();
  const loginStatus = useCurrentLoginStatus();
  const setAuthAtom = useSetAtom(authAtom);
  const setOnceSignedInEvent = useSetAtom(setOnceSignedInEventAtom);

  const confirm = useCallback(() => {
    return propsOnConfirm?.();
  }, [propsOnConfirm]);

  const onConfirm = useCallback(() => {
    if (loginStatus === 'unauthenticated') {
      setAuthAtom(prev => ({
        ...prev,
        openModal: true,
      }));
      setOnceSignedInEvent(confirm);
    }
    if (loginStatus === 'authenticated') {
      return propsOnConfirm?.();
    }
  }, [confirm, loginStatus, propsOnConfirm, setAuthAtom, setOnceSignedInEvent]);

  return (
    <ConfirmModal
      title={t['Enable AFFiNE Cloud']()}
      description={t['Enable AFFiNE Cloud Description']()}
      cancelText={t['com.affine.enableAffineCloudModal.button.cancel']()}
      onConfirm={onConfirm}
      confirmButtonOptions={{
        type: 'primary',
        ['data-testid' as string]: 'confirm-enable-affine-cloud-button',
        children:
          loginStatus === 'authenticated'
            ? t['Enable']()
            : t['Sign in and Enable'](),
      }}
      {...props}
    />
  );
};
