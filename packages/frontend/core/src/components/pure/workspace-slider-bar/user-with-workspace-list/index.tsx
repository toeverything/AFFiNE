import { Divider } from '@affine/component/ui/divider';
import { MenuItem } from '@affine/component/ui/menu';
import { useSession } from '@affine/core/hooks/affine/use-current-user';
import { Unreachable } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Logo1Icon } from '@blocksuite/icons';
import { WorkspaceManager } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

import {
  authAtom,
  openCreateWorkspaceModalAtom,
  openDisableCloudAlertModalAtom,
} from '../../../../atoms';
import { AddWorkspace } from './add-workspace';
import * as styles from './index.css';
import { UserAccountItem } from './user-account';
import { AFFiNEWorkspaceList } from './workspace-list';

const SignInItem = () => {
  const setDisableCloudOpen = useSetAtom(openDisableCloudAlertModalAtom);

  const setOpen = useSetAtom(authAtom);

  const t = useAFFiNEI18N();

  const onClickSignIn = useCallback(() => {
    if (!runtimeConfig.enableCloud) {
      setDisableCloudOpen(true);
    } else {
      setOpen(state => ({
        ...state,
        openModal: true,
      }));
    }
  }, [setOpen, setDisableCloudOpen]);

  return (
    <MenuItem
      className={styles.menuItem}
      onClick={onClickSignIn}
      data-testid="cloud-signin-button"
    >
      <div className={styles.signInWrapper}>
        <div className={styles.iconContainer}>
          <Logo1Icon />
        </div>

        <div className={styles.signInTextContainer}>
          <div className={styles.signInTextPrimary}>
            {t['com.affine.workspace.cloud.auth']()}
          </div>
          <div className={styles.signInTextSecondary}>
            {t['com.affine.workspace.cloud.description']()}
          </div>
        </div>
      </div>
    </MenuItem>
  );
};

export const UserWithWorkspaceList = ({
  onEventEnd,
}: {
  onEventEnd?: () => void;
}) => {
  const { user, status } = useSession();

  const isAuthenticated = status === 'authenticated';

  const setOpenCreateWorkspaceModal = useSetAtom(openCreateWorkspaceModalAtom);
  const setDisableCloudOpen = useSetAtom(openDisableCloudAlertModalAtom);

  const setOpenSignIn = useSetAtom(authAtom);

  const openSignInModal = useCallback(() => {
    if (!runtimeConfig.enableCloud) {
      setDisableCloudOpen(true);
    } else {
      setOpenSignIn(state => ({
        ...state,
        openModal: true,
      }));
    }
  }, [setDisableCloudOpen, setOpenSignIn]);

  const onNewWorkspace = useCallback(() => {
    if (
      !isAuthenticated &&
      !environment.isDesktop &&
      !runtimeConfig.allowLocalWorkspace
    ) {
      return openSignInModal();
    }
    setOpenCreateWorkspaceModal('new');
    onEventEnd?.();
  }, [
    isAuthenticated,
    onEventEnd,
    openSignInModal,
    setOpenCreateWorkspaceModal,
  ]);

  const onAddWorkspace = useCallback(() => {
    setOpenCreateWorkspaceModal('add');
    onEventEnd?.();
  }, [onEventEnd, setOpenCreateWorkspaceModal]);

  const workspaceManager = useService(WorkspaceManager);
  const workspaces = useLiveData(workspaceManager.list.workspaceList);

  // revalidate workspace list when mounted
  useEffect(() => {
    workspaceManager.list.revalidate().catch(err => {
      throw new Unreachable('revlidate should never throw, ' + err);
    });
  }, [workspaceManager]);

  return (
    <div className={styles.workspaceListWrapper}>
      {isAuthenticated ? (
        <UserAccountItem
          email={user?.email ?? 'Unknown User'}
          onEventEnd={onEventEnd}
        />
      ) : (
        <SignInItem />
      )}
      <Divider size="thinner" />
      <AFFiNEWorkspaceList onEventEnd={onEventEnd} />
      {workspaces.length > 0 ? <Divider size="thinner" /> : null}
      <AddWorkspace
        onAddWorkspace={onAddWorkspace}
        onNewWorkspace={onNewWorkspace}
      />
    </div>
  );
};
