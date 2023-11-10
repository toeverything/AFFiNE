import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { Logo1Icon } from '@blocksuite/icons';
import { Divider } from '@toeverything/components/divider';
import { MenuItem } from '@toeverything/components/menu';
import { useAtomValue, useSetAtom } from 'jotai';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useSession } from 'next-auth/react';
import { useCallback, useMemo } from 'react';

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
  const { data: session, status } = useSession();

  const isAuthenticated = useMemo(() => status === 'authenticated', [status]);

  const setOpenCreateWorkspaceModal = useSetAtom(openCreateWorkspaceModalAtom);

  const onNewWorkspace = useCallback(() => {
    setOpenCreateWorkspaceModal('new');
    onEventEnd?.();
  }, [onEventEnd, setOpenCreateWorkspaceModal]);

  const onAddWorkspace = useCallback(() => {
    setOpenCreateWorkspaceModal('add');
    onEventEnd?.();
  }, [onEventEnd, setOpenCreateWorkspaceModal]);

  const workspaces = useAtomValue(rootWorkspacesMetadataAtom, {
    delay: 0,
  });

  return (
    <div className={styles.workspaceListWrapper}>
      {isAuthenticated ? (
        <UserAccountItem
          email={session?.user.email ?? 'Unknown User'}
          onEventEnd={onEventEnd}
        />
      ) : (
        <SignInItem />
      )}
      <Divider size="thinner" />
      <AFFiNEWorkspaceList workspaces={workspaces} onEventEnd={onEventEnd} />
      {workspaces.length > 0 ? <Divider size="thinner" /> : null}
      <AddWorkspace
        onAddWorkspace={onAddWorkspace}
        onNewWorkspace={onNewWorkspace}
      />
    </div>
  );
};
