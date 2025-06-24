import {
  type ConfirmModalProps,
  notify,
  useConfirmModal,
} from '@affine/component';
import { AuthService } from '@affine/core/modules/cloud';
import { UserFriendlyError } from '@affine/error';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import { useCallback } from 'react';

import { useNavigateHelper } from '../use-navigate-helper';

type SignOutConfirmModalI18NKeys =
  | 'title'
  | 'description'
  | 'cancel'
  | 'confirm';

export const useSignOut = ({
  onConfirm,
  confirmButtonOptions,
  contentOptions,
  ...props
}: ConfirmModalProps = {}) => {
  const t = useI18n();
  const { openConfirmModal } = useConfirmModal();
  const { jumpToIndex } = useNavigateHelper();

  const authService = useService(AuthService);

  const signOut = useCallback(async () => {
    onConfirm?.()?.catch(console.error);
    try {
      await authService.signOut();
      jumpToIndex();
    } catch (err) {
      console.error(err);
      const error = UserFriendlyError.fromAny(err);
      notify.error(error);
    }
  }, [authService, jumpToIndex, onConfirm]);

  const getDefaultText = useCallback(
    (key: SignOutConfirmModalI18NKeys) => {
      return t[`com.affine.auth.sign-out.confirm-modal.${key}`]();
    },
    [t]
  );

  const confirmSignOut = useCallback(() => {
    openConfirmModal({
      title: getDefaultText('title'),
      description: getDefaultText('description'),
      cancelText: getDefaultText('cancel'),
      confirmText: getDefaultText('confirm'),
      confirmButtonOptions: {
        ...confirmButtonOptions,
        variant: 'error',
        ['data-testid' as string]: 'confirm-sign-out-button',
      },
      contentOptions: {
        ...contentOptions,
        ['data-testid' as string]: 'confirm-sign-out-modal',
      },
      onConfirm: signOut,
      ...props,
    });
  }, [
    confirmButtonOptions,
    contentOptions,
    getDefaultText,
    openConfirmModal,
    props,
    signOut,
  ]);

  return confirmSignOut;
};
