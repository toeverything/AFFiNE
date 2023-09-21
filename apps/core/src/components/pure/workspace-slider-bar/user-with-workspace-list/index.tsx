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
  openDisableCloudAlertModalAtom,
  openSettingModalAtom,
} from '../../../../atoms';
import { AddWorkspace } from './add-workspace';
import * as styles from './index.css';
import { UserAccount } from './user-account';
import { AFFiNEWorkspaceList } from './workspace-list';

const SignInItem = () => {
  const setDisableCloudOpen = useSetAtom(openDisableCloudAlertModalAtom);

  const setOpen = useSetAtom(authAtom);

  const t = useAFFiNEI18N();

  const onClickSignIn = useCallback(async () => {
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
      style={{ borderRadius: '8px' }}
      onClick={onClickSignIn}
      data-testid="cloud-signin-button"
    >
      <div className={styles.SignInWrapper}>
        <div className={styles.IconContainer}>
          <Logo1Icon />
        </div>

        <div className={styles.SignInTextContainer}>
          <div className={styles.SignInTextPrimary}>
            {t['com.affine.workspace.cloud.auth']()}
          </div>
          <div className={styles.SignInTextSecondary}>
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
  const setSettingModalAtom = useSetAtom(openSettingModalAtom);

  const { data: session, status } = useSession();

  const isAuthenticated = useMemo(() => status === 'authenticated', [status]);

  const onOpenAccountSetting = useCallback(() => {
    setSettingModalAtom(prev => ({
      ...prev,
      open: true,
      activeTab: 'account',
    }));
  }, [setSettingModalAtom]);

  const workspaces = useAtomValue(rootWorkspacesMetadataAtom, {
    delay: 0,
  });
  return (
    <div className={styles.WorkspaceListWrapper}>
      {isAuthenticated ? (
        <UserAccount
          email={session?.user.email ?? 'Unknown User'}
          onOpenAccountSetting={onOpenAccountSetting}
          onEventEnd={onEventEnd}
        />
      ) : (
        <SignInItem />
      )}
      <Divider size="thinner" />
      <AFFiNEWorkspaceList workspaces={workspaces} onEventEnd={onEventEnd} />
      {workspaces.length > 0 ? <Divider size="thinner" /> : null}
      <AddWorkspace />
    </div>
  );
};
