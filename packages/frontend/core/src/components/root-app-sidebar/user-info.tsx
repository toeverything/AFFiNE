import {
  Avatar,
  Button,
  Divider,
  Menu,
  MenuIcon,
  MenuItem,
} from '@affine/component';
import {
  authAtom,
  openDisableCloudAlertModalAtom,
  openSettingModalAtom,
  openSignOutModalAtom,
} from '@affine/core/atoms';
import {
  useCurrentUser,
  useSession,
} from '@affine/core/hooks/affine/use-current-user';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { AccountIcon, SignOutIcon } from '@blocksuite/icons';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import * as styles from './index.css';
import { UnknownUserIcon } from './unknow-user';

export const UserInfo = () => {
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';
  return isAuthenticated ? <AuthorizedUserInfo /> : <UnauthorizedUserInfo />;
};

const AuthorizedUserInfo = () => {
  const user = useCurrentUser();
  return (
    <Menu items={<OperationMenu />}>
      <Button
        data-testid="sidebar-user-avatar"
        type="plain"
        className={styles.userInfoWrapper}
      >
        <Avatar size={24} name={user.name} url={user.avatarUrl} />
      </Button>
    </Menu>
  );
};

const UnauthorizedUserInfo = () => {
  const setDisableCloudOpen = useSetAtom(openDisableCloudAlertModalAtom);
  const setOpen = useSetAtom(authAtom);

  const openSignInModal = useCallback(() => {
    if (!runtimeConfig.enableCloud) setDisableCloudOpen(true);
    else setOpen(state => ({ ...state, openModal: true }));
  }, [setDisableCloudOpen, setOpen]);

  return (
    <Button
      onClick={openSignInModal}
      data-testid="sidebar-user-avatar"
      type="plain"
      className={styles.userInfoWrapper}
    >
      <UnknownUserIcon width={24} height={24} />
    </Button>
  );
};

const AccountMenu = () => {
  const setSettingModalAtom = useSetAtom(openSettingModalAtom);
  const setOpenSignOutModalAtom = useSetAtom(openSignOutModalAtom);

  const onOpenAccountSetting = useCallback(() => {
    setSettingModalAtom(prev => ({
      ...prev,
      open: true,
      activeTab: 'account',
    }));
  }, [setSettingModalAtom]);

  const onOpenSignOutModal = useCallback(() => {
    setOpenSignOutModalAtom(true);
  }, [setOpenSignOutModalAtom]);

  const t = useAFFiNEI18N();

  return (
    <>
      <MenuItem
        preFix={
          <MenuIcon>
            <AccountIcon />
          </MenuIcon>
        }
        data-testid="workspace-modal-account-settings-option"
        onClick={onOpenAccountSetting}
      >
        {t['com.affine.workspace.cloud.account.settings']()}
      </MenuItem>
      <Divider />
      <MenuItem
        preFix={
          <MenuIcon>
            <SignOutIcon />
          </MenuIcon>
        }
        data-testid="workspace-modal-sign-out-option"
        onClick={onOpenSignOutModal}
      >
        {t['com.affine.workspace.cloud.account.logout']()}
      </MenuItem>
    </>
  );
};

const OperationMenu = () => {
  // TODO: display usage progress bar
  const StorageUsage = null;

  return (
    <>
      {StorageUsage}
      <AccountMenu />
    </>
  );
};
