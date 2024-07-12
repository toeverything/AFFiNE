import { notify } from '@affine/component';
import { events } from '@affine/electron-api';
import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  useLiveData,
  useService,
  useServiceOptional,
  WorkspaceService,
  WorkspacesService,
} from '@toeverything/infra';
import { useAtom } from 'jotai';
import type { ReactElement } from 'react';
import { useCallback, useEffect } from 'react';

import type { SettingAtom } from '../atoms';
import {
  authAtom,
  openCreateWorkspaceModalAtom,
  openSettingModalAtom,
  openSignOutModalAtom,
} from '../atoms';
import { AuthModal as Auth } from '../components/affine/auth';
import { AiLoginRequiredModal } from '../components/affine/auth/ai-login-required';
import { CreateWorkspaceModal } from '../components/affine/create-workspace-modal';
import { HistoryTipsModal } from '../components/affine/history-tips-modal';
import { IssueFeedbackModal } from '../components/affine/issue-feedback-modal';
import {
  CloudQuotaModal,
  LocalQuotaModal,
} from '../components/affine/quota-reached-modal';
import { SettingModal } from '../components/affine/setting-modal';
import { SignOutModal } from '../components/affine/sign-out-modal';
import { StarAFFiNEModal } from '../components/affine/star-affine-modal';
import { MoveToTrash } from '../components/page-list';
import { useTrashModalHelper } from '../hooks/affine/use-trash-modal-helper';
import { useAsyncCallback } from '../hooks/affine-async-hooks';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
import { AuthService } from '../modules/cloud/services/auth';
import { FindInPageModal } from '../modules/find-in-page/view/find-in-page-modal';
import { PeekViewManagerModal } from '../modules/peek-view';
import { WorkspaceSubPath } from '../shared';

export const Setting = () => {
  const [{ open, workspaceMetadata, activeTab }, setOpenSettingModalAtom] =
    useAtom(openSettingModalAtom);

  const onSettingClick = useCallback(
    ({
      activeTab,
      workspaceMetadata,
    }: Pick<SettingAtom, 'activeTab' | 'workspaceMetadata'>) => {
      setOpenSettingModalAtom(prev => ({
        ...prev,
        activeTab,
        workspaceMetadata,
      }));
    },
    [setOpenSettingModalAtom]
  );

  const onOpenChange = useCallback(
    (open: boolean) => {
      setOpenSettingModalAtom(prev => ({ ...prev, open }));
    },
    [setOpenSettingModalAtom]
  );

  useEffect(() => {
    if (environment.isDesktop) {
      return events?.applicationMenu.openAboutPageInSettingModal(() =>
        setOpenSettingModalAtom({
          activeTab: 'about',
          open: true,
        })
      );
    }
    return;
  }, [setOpenSettingModalAtom]);

  if (!open) {
    return null;
  }

  return (
    <SettingModal
      open={open}
      activeTab={activeTab}
      workspaceMetadata={workspaceMetadata}
      onSettingClick={onSettingClick}
      onOpenChange={onOpenChange}
    />
  );
};

export const AuthModal = (): ReactElement => {
  const [
    { openModal, state, email = '', emailType = 'changePassword' },
    setAuthAtom,
  ] = useAtom(authAtom);

  return (
    <Auth
      open={openModal}
      state={state}
      email={email}
      emailType={emailType}
      setEmailType={useCallback(
        emailType => {
          setAuthAtom(prev => ({ ...prev, emailType }));
        },
        [setAuthAtom]
      )}
      setOpen={useCallback(
        open => {
          setAuthAtom(prev => ({ ...prev, openModal: open }));
        },
        [setAuthAtom]
      )}
      setAuthState={useCallback(
        state => {
          setAuthAtom(prev => ({ ...prev, state }));
        },
        [setAuthAtom]
      )}
      setAuthEmail={useCallback(
        email => {
          setAuthAtom(prev => ({ ...prev, email }));
        },
        [setAuthAtom]
      )}
    />
  );
};

export function CurrentWorkspaceModals() {
  const currentWorkspace = useService(WorkspaceService).workspace;

  const { trashModal, setTrashModal, handleOnConfirm } = useTrashModalHelper(
    currentWorkspace.docCollection
  );
  const deletePageTitles = trashModal.pageTitles;
  const trashConfirmOpen = trashModal.open;
  const onTrashConfirmOpenChange = useCallback(
    (open: boolean) => {
      setTrashModal({
        ...trashModal,
        open,
      });
    },
    [trashModal, setTrashModal]
  );

  return (
    <>
      <StarAFFiNEModal />
      <IssueFeedbackModal />
      {currentWorkspace ? <Setting /> : null}
      {currentWorkspace?.flavour === WorkspaceFlavour.LOCAL && (
        <>
          <LocalQuotaModal />
          <HistoryTipsModal />
        </>
      )}
      {currentWorkspace?.flavour === WorkspaceFlavour.AFFINE_CLOUD && (
        <CloudQuotaModal />
      )}
      <AiLoginRequiredModal />
      <PeekViewManagerModal />
      {environment.isDesktop && <FindInPageModal />}
      <MoveToTrash.ConfirmModal
        open={trashConfirmOpen}
        onConfirm={handleOnConfirm}
        onOpenChange={onTrashConfirmOpenChange}
        titles={deletePageTitles}
      />
    </>
  );
}

export const SignOutConfirmModal = () => {
  const { openPage } = useNavigateHelper();
  const authService = useService(AuthService);
  const [open, setOpen] = useAtom(openSignOutModalAtom);
  const currentWorkspace = useServiceOptional(WorkspaceService)?.workspace;
  const workspaces = useLiveData(
    useService(WorkspacesService).list.workspaces$
  );

  const onConfirm = useAsyncCallback(async () => {
    setOpen(false);
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
    if (currentWorkspace?.flavour === WorkspaceFlavour.AFFINE_CLOUD) {
      const localWorkspace = workspaces.find(
        w => w.flavour === WorkspaceFlavour.LOCAL
      );
      if (localWorkspace) {
        openPage(localWorkspace.id, WorkspaceSubPath.ALL);
      }
    }
  }, [authService, currentWorkspace, openPage, setOpen, workspaces]);

  return (
    <SignOutModal open={open} onOpenChange={setOpen} onConfirm={onConfirm} />
  );
};

export const AllWorkspaceModals = (): ReactElement => {
  const [isOpenCreateWorkspaceModal, setOpenCreateWorkspaceModal] = useAtom(
    openCreateWorkspaceModalAtom
  );

  const { jumpToSubPath, jumpToPage } = useNavigateHelper();

  return (
    <>
      <CreateWorkspaceModal
        mode={isOpenCreateWorkspaceModal}
        onClose={useCallback(() => {
          setOpenCreateWorkspaceModal(false);
        }, [setOpenCreateWorkspaceModal])}
        onCreate={useCallback(
          (id, defaultDocId) => {
            setOpenCreateWorkspaceModal(false);
            // if jumping immediately, the page may stuck in loading state
            // not sure why yet .. here is a workaround
            setTimeout(() => {
              if (!defaultDocId) {
                jumpToSubPath(id, WorkspaceSubPath.ALL);
              } else {
                jumpToPage(id, defaultDocId);
              }
            });
          },
          [jumpToPage, jumpToSubPath, setOpenCreateWorkspaceModal]
        )}
      />
      <AuthModal />
      <SignOutConfirmModal />
    </>
  );
};
