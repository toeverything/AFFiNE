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
import { lazy, Suspense, useCallback, useEffect } from 'react';

import type { SettingAtom } from '../atoms';
import {
  authAtom,
  openCreateWorkspaceModalAtom,
  openDisableCloudAlertModalAtom,
  openSettingModalAtom,
  openSignOutModalAtom,
} from '../atoms';
import { PaymentDisableModal } from '../components/affine/payment-disable';
import { useAsyncCallback } from '../hooks/affine-async-hooks';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
import { AuthService } from '../modules/cloud/services/auth';
import { WorkspaceSubPath } from '../shared';

const SettingModal = lazy(() =>
  import('../components/affine/setting-modal').then(module => ({
    default: module.SettingModal,
  }))
);

const Auth = lazy(() =>
  import('../components/affine/auth').then(module => ({
    default: module.AuthModal,
  }))
);

const CreateWorkspaceModal = lazy(() =>
  import('../components/affine/create-workspace-modal').then(module => ({
    default: module.CreateWorkspaceModal,
  }))
);

const TmpDisableAffineCloudModal = lazy(() =>
  import('../components/affine/tmp-disable-affine-cloud-modal').then(
    module => ({
      default: module.TmpDisableAffineCloudModal,
    })
  )
);

const SignOutModal = lazy(() =>
  import('../components/affine/sign-out-modal').then(module => ({
    default: module.SignOutModal,
  }))
);

const LocalQuotaModal = lazy(() =>
  import('../components/affine/quota-reached-modal').then(module => ({
    default: module.LocalQuotaModal,
  }))
);

const CloudQuotaModal = lazy(() =>
  import('../components/affine/quota-reached-modal').then(module => ({
    default: module.CloudQuotaModal,
  }))
);

const StarAFFiNEModal = lazy(() =>
  import('../components/affine/star-affine-modal').then(module => ({
    default: module.StarAFFiNEModal,
  }))
);

const IssueFeedbackModal = lazy(() =>
  import('../components/affine/issue-feedback-modal').then(module => ({
    default: module.IssueFeedbackModal,
  }))
);

const HistoryTipsModal = lazy(() =>
  import('../components/affine/history-tips-modal').then(module => ({
    default: module.HistoryTipsModal,
  }))
);

const AiLoginRequiredModal = lazy(() =>
  import('../components/affine/auth/ai-login-required').then(module => ({
    default: module.AiLoginRequiredModal,
  }))
);
const FindInPageModal = lazy(() =>
  import('../modules/find-in-page/view/find-in-page-modal').then(module => ({
    default: module.FindInPageModal,
  }))
);

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
  const [openDisableCloudAlertModal, setOpenDisableCloudAlertModal] = useAtom(
    openDisableCloudAlertModalAtom
  );

  return (
    <>
      <Suspense>
        <TmpDisableAffineCloudModal
          open={openDisableCloudAlertModal}
          onOpenChange={setOpenDisableCloudAlertModal}
        />
      </Suspense>
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
      {environment.isDesktop && <FindInPageModal />}
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
      // TODO: i18n
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
      <Suspense>
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
      </Suspense>
      <Suspense>
        <AuthModal />
      </Suspense>
      <Suspense>
        <SignOutConfirmModal />
      </Suspense>
      <PaymentDisableModal />
    </>
  );
};
