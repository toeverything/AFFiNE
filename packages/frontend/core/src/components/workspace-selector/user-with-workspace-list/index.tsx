import { Divider } from '@affine/component/ui/divider';
import { MenuItem } from '@affine/component/ui/menu';
import { authAtom } from '@affine/core/components/atoms';
import { AuthService } from '@affine/core/modules/cloud';
import { CreateWorkspaceDialogService } from '@affine/core/modules/create-workspace';
import type { CreateWorkspaceCallbackPayload } from '@affine/core/modules/create-workspace/types';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { Logo1Icon } from '@blocksuite/icons/rc';
import {
  FeatureFlagService,
  useLiveData,
  useService,
  type WorkspaceMetadata,
  WorkspacesService,
} from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

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

interface UserWithWorkspaceListProps {
  onEventEnd?: () => void;
  onClickWorkspace?: (workspace: WorkspaceMetadata) => void;
  onCreatedWorkspace?: (payload: CreateWorkspaceCallbackPayload) => void;
  showSettingsButton?: boolean;
  showEnableCloudButton?: boolean;
}

const UserWithWorkspaceListInner = ({
  onEventEnd,
  onClickWorkspace,
  onCreatedWorkspace,
  showSettingsButton,
  showEnableCloudButton,
}: UserWithWorkspaceListProps) => {
  const createWorkspaceDialogService = useService(CreateWorkspaceDialogService);
  const session = useLiveData(useService(AuthService).session.session$);
  const featureFlagService = useService(FeatureFlagService);

  const isAuthenticated = session.status === 'authenticated';

  const setOpenSignIn = useSetAtom(authAtom);

  const openSignInModal = useCallback(() => {
    setOpenSignIn(state => ({
      ...state,
      openModal: true,
    }));
  }, [setOpenSignIn]);

  const onNewWorkspace = useCallback(() => {
    if (
      !isAuthenticated &&
      !featureFlagService.flags.enable_local_workspace.value
    ) {
      return openSignInModal();
    }
    track.$.navigationPanel.workspaceList.createWorkspace();
    createWorkspaceDialogService.dialog.open('new', payload => {
      if (payload) {
        onCreatedWorkspace?.(payload);
      }
    });
    onEventEnd?.();
  }, [
    createWorkspaceDialogService,
    featureFlagService,
    isAuthenticated,
    onCreatedWorkspace,
    onEventEnd,
    openSignInModal,
  ]);

  const onAddWorkspace = useCallback(() => {
    track.$.navigationPanel.workspaceList.createWorkspace({
      control: 'import',
    });
    createWorkspaceDialogService.dialog.open('add', payload => {
      if (payload) {
        onCreatedWorkspace?.(payload);
      }
    });
    onEventEnd?.();
  }, [createWorkspaceDialogService.dialog, onCreatedWorkspace, onEventEnd]);

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
      <AFFiNEWorkspaceList
        onEventEnd={onEventEnd}
        onClickWorkspace={onClickWorkspace}
        showEnableCloudButton={showEnableCloudButton}
        showSettingsButton={showSettingsButton}
      />
      {workspaces.length > 0 ? <Divider size="thinner" /> : null}
      <AddWorkspace
        onAddWorkspace={onAddWorkspace}
        onNewWorkspace={onNewWorkspace}
      />
    </div>
  );
};

export const UserWithWorkspaceList = (props: UserWithWorkspaceListProps) => {
  return <UserWithWorkspaceListInner {...props} />;
};
