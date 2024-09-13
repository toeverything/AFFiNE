import {
  type ConfirmModalProps,
  notify,
  useConfirmModal,
} from '@affine/component';
import { AuthService } from '@affine/core/modules/cloud';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useI18n } from '@affine/i18n';
import {
  GlobalContextService,
  useLiveData,
  useService,
  WorkspacesService,
} from '@toeverything/infra';
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
  const { openPage } = useNavigateHelper();

  const authService = useService(AuthService);
  const workspacesService = useService(WorkspacesService);
  const globalContextService = useService(GlobalContextService);

  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const currentWorkspaceId = useLiveData(
    globalContextService.globalContext.workspaceId.$
  );
  const currentWorkspaceMetadata = useLiveData(
    currentWorkspaceId
      ? workspacesService.list.workspace$(currentWorkspaceId)
      : undefined
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

    // if current workspace is affine cloud, switch to local workspace
    if (currentWorkspaceMetadata?.flavour === WorkspaceFlavour.AFFINE_CLOUD) {
      const localWorkspace = workspaces.find(
        w => w.flavour === WorkspaceFlavour.LOCAL
      );
      if (localWorkspace) {
        openPage(localWorkspace.id, 'all');
      }
    }
  }, [
    authService,
    currentWorkspaceMetadata?.flavour,
    onConfirm,
    openPage,
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
