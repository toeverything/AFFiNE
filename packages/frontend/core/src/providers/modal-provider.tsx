import { WorkspaceSubPath } from '@affine/env/workspace';
import { assertExists } from '@blocksuite/global/utils';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import { useAtom } from 'jotai';
import type { ReactElement } from 'react';
import { lazy, Suspense, useCallback } from 'react';

import type { SettingAtom } from '../atoms';
import {
  authAtom,
  openCreateWorkspaceModalAtom,
  openDisableCloudAlertModalAtom,
  openSettingModalAtom,
  openSignOutModalAtom,
} from '../atoms';
import { PaymentDisableModal } from '../components/affine/payment-disable';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
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

const OnboardingModal = lazy(() =>
  import('../components/affine/onboarding-modal').then(module => ({
    default: module.OnboardingModal,
  }))
);

const SignOutModal = lazy(() =>
  import('../components/affine/sign-out-modal').then(module => ({
    default: module.SignOutModal,
  }))
);

export const Setting = () => {
  const [currentWorkspace] = useCurrentWorkspace();
  const [{ open, workspaceId, activeTab }, setOpenSettingModalAtom] =
    useAtom(openSettingModalAtom);
  assertExists(currentWorkspace);

  const onSettingClick = useCallback(
    ({
      activeTab,
      workspaceId,
    }: Pick<SettingAtom, 'activeTab' | 'workspaceId'>) => {
      setOpenSettingModalAtom(prev => ({ ...prev, activeTab, workspaceId }));
    },
    [setOpenSettingModalAtom]
  );

  return (
    <SettingModal
      open={open}
      activeTab={activeTab}
      workspaceId={workspaceId}
      onSettingClick={onSettingClick}
      onOpenChange={useCallback(
        (open: boolean) => {
          setOpenSettingModalAtom(prev => ({ ...prev, open }));
        },
        [setOpenSettingModalAtom]
      )}
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
  const [currentWorkspace] = useCurrentWorkspace();
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
      {environment.isDesktop && (
        <Suspense>
          <OnboardingModal />
        </Suspense>
      )}
      {currentWorkspace && <Setting />}
    </>
  );
}

export const SignOutConfirmModal = () => {
  const { jumpToIndex } = useNavigateHelper();
  const [open, setOpen] = useAtom(openSignOutModalAtom);

  const onConfirm = useAsyncCallback(async () => {
    setOpen(false);
    await signOutCloud();
    jumpToIndex();
  }, [jumpToIndex, setOpen]);

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
