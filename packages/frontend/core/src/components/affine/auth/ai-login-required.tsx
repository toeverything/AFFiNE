import { useConfirmModal } from '@affine/component';
import { authAtom } from '@affine/core/components/atoms';
import { useI18n } from '@affine/i18n';
import { atom, useAtom, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

export const showAILoginRequiredAtom = atom(false);

export const AiLoginRequiredModal = () => {
  const t = useI18n();
  const [open, setOpen] = useAtom(showAILoginRequiredAtom);
  const setAuth = useSetAtom(authAtom);
  const { openConfirmModal, closeConfirmModal } = useConfirmModal();

  const openSignIn = useCallback(() => {
    setAuth(prev => ({ ...prev, openModal: true }));
  }, [setAuth]);

  useEffect(() => {
    if (open) {
      openConfirmModal({
        title: t['com.affine.ai.login-required.dialog-title'](),
        description: t['com.affine.ai.login-required.dialog-content'](),
        onConfirm: () => {
          setOpen(false);
          openSignIn();
        },
        confirmText: t['com.affine.ai.login-required.dialog-confirm'](),
        confirmButtonOptions: {
          variant: 'primary',
        },
        cancelText: t['com.affine.ai.login-required.dialog-cancel'](),
        onOpenChange: setOpen,
      });
    } else {
      closeConfirmModal();
    }
  }, [closeConfirmModal, open, openConfirmModal, openSignIn, setOpen, t]);

  return null;
};
