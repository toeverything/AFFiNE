import { WorkspaceFlavour } from '@affine/env/workspace';
import { WorkspaceManager } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import { useAtom } from 'jotai';
import type { ReactElement } from 'react';
import { lazy, Suspense, useCallback } from 'react';

import {
  authAtom,
  openCreateWorkspaceModalAtom,
  openDisableCloudAlertModalAtom,
  openSettingModalAtom,
  openSignOutModalAtom,
  type SettingAtom,
} from '../atoms';
import { PaymentDisableModal } from '../components/affine/payment-disable';
import { useAsyncCallback } from '../hooks/affine-async-hooks';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
import { CurrentWorkspaceService } from '../modules/workspace/current-workspace';
import { WorkspaceSubPath } from '../shared';
import { signOutCloud } from '../utils/cloud-utils';

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

const WorkspaceGuideModal = lazy(() =>
  import('../components/affine/onboarding/workspace-guide-modal').then(
    module => ({
      default: module.WorkspaceGuideModal,
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
  const currentWorkspace = useLiveData(
    useService(CurrentWorkspaceService).currentWorkspace
  );
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
      <WorkspaceGuideModal />
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
    </>
  );
}

export const SignOutConfirmModal = () => {
  const { openPage } = useNavigateHelper();
  const [open, setOpen] = useAtom(openSignOutModalAtom);
  const currentWorkspace = useLiveData(
    useService(CurrentWorkspaceService).currentWorkspace
  );
  const workspaces = useLiveData(
    useService(WorkspaceManager).list.workspaceList
  );

  const onConfirm = useAsyncCallback(async () => {
    setOpen(false);
    await signOutCloud();

    // if current workspace is affine cloud, switch to local workspace
    if (currentWorkspace?.flavour === WorkspaceFlavour.AFFINE_CLOUD) {
      const localWorkspace = workspaces.find(
        w => w.flavour === WorkspaceFlavour.LOCAL
      );
      if (localWorkspace) {
        openPage(localWorkspace.id, WorkspaceSubPath.ALL);
      }
    }
  }, [currentWorkspace?.flavour, openPage, setOpen, workspaces]);

  return (
    <SignOutModal open={open} onOpenChange={setOpen} onConfirm={onConfirm} />
  );
};

export const AllWorkspaceModals = (): ReactElement => {
  const [isOpenCreateWorkspaceModal, setOpenCreateWorkspaceModal] = useAtom(
    openCreateWorkspaceModalAtom
  );

  const { jumpToSubPath } = useNavigateHelper();

  return (
    <>
      <Suspense>
        <CreateWorkspaceModal
          mode={isOpenCreateWorkspaceModal}
          onClose={useCallback(() => {
            setOpenCreateWorkspaceModal(false);
          }, [setOpenCreateWorkspaceModal])}
          onCreate={useCallback(
            id => {
              setOpenCreateWorkspaceModal(false);
              // if jumping immediately, the page may stuck in loading state
              // not sure why yet .. here is a workaround
              setTimeout(() => {
                jumpToSubPath(id, WorkspaceSubPath.ALL);
              });
            },
            [jumpToSubPath, setOpenCreateWorkspaceModal]
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
