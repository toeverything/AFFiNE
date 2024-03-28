import { useConfirmModal } from '@affine/component';
import { authAtom } from '@affine/core/atoms';
import { setOnceSignedInEventAtom } from '@affine/core/atoms/event';
import { WorkspaceSubPath } from '@affine/core/shared';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { Workspace } from '@toeverything/infra';
import { useService, WorkspaceManager } from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { useNavigateHelper } from '../use-navigate-helper';
import { useCurrentLoginStatus } from './use-current-login-status';

interface ConfirmEnableCloudOptions {
  /**
   * Fired when the workspace is successfully enabled
   */
  onSuccess?: () => void;
  /**
   * Fired when workspace is successfully enabled or user cancels the operation
   */
  onFinished?: () => void;
  openPageId?: string;
}
type ConfirmEnableArgs = [Workspace, ConfirmEnableCloudOptions | undefined];

export const useEnableCloud = () => {
  const t = useAFFiNEI18N();
  const loginStatus = useCurrentLoginStatus();
  const setAuthAtom = useSetAtom(authAtom);
  const setOnceSignedInEvent = useSetAtom(setOnceSignedInEventAtom);
  const { openConfirmModal, closeConfirmModal } = useConfirmModal();
  const workspaceManager = useService(WorkspaceManager);
  const { openPage } = useNavigateHelper();

  const enableCloud = useCallback(
    async (ws: Workspace | null, options?: ConfirmEnableCloudOptions) => {
      if (!ws) return;
      const { id: newId } = await workspaceManager.transformLocalToCloud(ws);
      openPage(newId, options?.openPageId || WorkspaceSubPath.ALL);
      options?.onSuccess?.();
    },
    [openPage, workspaceManager]
  );

  const openSignIn = useCallback(
    (...args: ConfirmEnableArgs) => {
      setAuthAtom(prev => ({ ...prev, openModal: true }));
      setOnceSignedInEvent(() => {
        enableCloud(...args).catch(console.error);
      });
    },
    [enableCloud, setAuthAtom, setOnceSignedInEvent]
  );

  const signInOrEnableCloud = useCallback(
    async (...args: ConfirmEnableArgs) => {
      // not logged in, open login modal
      if (loginStatus === 'unauthenticated') {
        openSignIn(...args);
      }

      if (loginStatus === 'authenticated') {
        await enableCloud(...args);
      }
    },
    [enableCloud, loginStatus, openSignIn]
  );

  const confirmEnableCloud = useCallback(
    (ws: Workspace, options?: ConfirmEnableCloudOptions) => {
      const { onSuccess, onFinished } = options ?? {};
      if (!runtimeConfig.enableCloud) return;

      const closeOnSuccess = () => {
        closeConfirmModal();
        onSuccess?.();
      };

      openConfirmModal(
        {
          title: t['Enable AFFiNE Cloud'](),
          description: t['Enable AFFiNE Cloud Description'](),
          cancelText: t['com.affine.enableAffineCloudModal.button.cancel'](),
          confirmButtonOptions: {
            type: 'primary',
            ['data-testid' as string]: 'confirm-enable-affine-cloud-button',
            children:
              loginStatus === 'authenticated'
                ? t['Enable']()
                : t['Sign in and Enable'](),
          },
          onConfirm: async () =>
            await signInOrEnableCloud(ws, {
              ...options,
              onSuccess: closeOnSuccess,
            }),
          onOpenChange: open => {
            if (!open) onFinished?.();
          },
        },
        { autoClose: false }
      );
    },
    [closeConfirmModal, loginStatus, openConfirmModal, signInOrEnableCloud, t]
  );

  return confirmEnableCloud;
};
