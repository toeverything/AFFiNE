import {
  type ConfirmModalProps,
  notify,
  useConfirmModal,
} from '@affine/component';
import { AuthService, ServerService } from '@affine/core/modules/cloud';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
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
  const { jumpToAll } = useNavigateHelper();

  const serverService = useService(ServerService);
  const authService = useService(AuthService);
  const workspacesService = useService(WorkspacesService);
  const globalContextService = useService(GlobalContextService);

  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const currentWorkspaceFlavour = useLiveData(
    globalContextService.globalContext.workspaceFlavour.$
  );

  const signOut = useCallback(async () => {
    onConfirm?.()?.catch(console.error);
    try {
      await authService.signOut();
    } catch (err) {
      console.error(err);
      // TODO(@eyhn): i18n
      notify.error({
        title: 'Failed to sign out',
      });
    }

    // if current workspace is sign out, switch to other workspace
    if (currentWorkspaceFlavour === serverService.server.id) {
      const localWorkspace = workspaces.find(
        w => w.flavour !== serverService.server.id
      );
      if (localWorkspace) {
        jumpToAll(localWorkspace.id);
      }
    }
  }, [
    authService,
    currentWorkspaceFlavour,
    jumpToAll,
    onConfirm,
    serverService.server.id,
    workspaces,
  ]);

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
