import { Loading } from '@affine/component';
import { Divider } from '@affine/component/ui/divider';
import { MenuItem } from '@affine/component/ui/menu';
import { track } from '@affine/core/mixpanel';
import { AuthService } from '@affine/core/modules/cloud';
import { useI18n } from '@affine/i18n';
import { Logo1Icon } from '@blocksuite/icons/rc';
import {
  useLiveData,
  useService,
  WorkspacesService,
} from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { Suspense, useCallback } from 'react';

import { authAtom, openCreateWorkspaceModalAtom } from '../../../../atoms';
import { AddWorkspace } from './add-workspace';
import * as styles from './index.css';
import { UserAccountItem } from './user-account';
import { AFFiNEWorkspaceList } from './workspace-list';

export const SignInItem = () => {
  const setOpen = useSetAtom(authAtom);

  const t = useI18n();

  const onClickSignIn = useCallback(() => {
    track.$.navigationPanel.workspaceList.signIn();
    setOpen(state => ({
      ...state,
      openModal: true,
    }));
  }, [setOpen]);

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

const UserWithWorkspaceListLoading = () => {
  return (
    <div className={styles.loadingWrapper}>
      <Loading size={24} />
    </div>
  );
};

interface UserWithWorkspaceListProps {
  onEventEnd?: () => void;
}

const UserWithWorkspaceListInner = ({
  onEventEnd,
}: UserWithWorkspaceListProps) => {
  const session = useLiveData(useService(AuthService).session.session$);

  const isAuthenticated = session.status === 'authenticated';

  const setOpenCreateWorkspaceModal = useSetAtom(openCreateWorkspaceModalAtom);

  const setOpenSignIn = useSetAtom(authAtom);

  const openSignInModal = useCallback(() => {
    setOpenSignIn(state => ({
      ...state,
      openModal: true,
    }));
  }, [setOpenSignIn]);

  const onNewWorkspace = useCallback(() => {
    if (!isAuthenticated && !runtimeConfig.allowLocalWorkspace) {
      return openSignInModal();
    }
    track.$.navigationPanel.workspaceList.createWorkspace();
    setOpenCreateWorkspaceModal('new');
    onEventEnd?.();
  }, [
    isAuthenticated,
    onEventEnd,
    openSignInModal,
    setOpenCreateWorkspaceModal,
  ]);

  track.$.navigationPanel.workspaceList.createWorkspace();
  const onAddWorkspace = useCallback(() => {
    track.$.navigationPanel.workspaceList.createWorkspace({
      control: 'import',
    });
    setOpenCreateWorkspaceModal('add');
    onEventEnd?.();
  }, [onEventEnd, setOpenCreateWorkspaceModal]);

  const workspaceManager = useService(WorkspacesService);
  const workspaces = useLiveData(workspaceManager.list.workspaces$);

  return (
    <div className={styles.workspaceListWrapper}>
      {isAuthenticated ? (
        <UserAccountItem
          email={session.session.account.email ?? 'Unknown User'}
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

export const UserWithWorkspaceList = (props: UserWithWorkspaceListProps) => {
  return (
    <Suspense fallback={<UserWithWorkspaceListLoading />}>
      <UserWithWorkspaceListInner {...props} />
    </Suspense>
  );
};
