import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  AccountIcon,
  MoreHorizontalIcon,
  SignOutIcon,
} from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { Divider } from '@toeverything/components/divider';
import { Menu, MenuIcon, MenuItem } from '@toeverything/components/menu';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import {
  openSettingModalAtom,
  openSignOutModalAtom,
} from '../../../../../atoms';
import { UserPlanButton } from '../../../../affine/auth/user-plan-button';
import * as styles from './index.css';

const AccountMenu = ({ onEventEnd }: { onEventEnd?: () => void }) => {
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
    onEventEnd?.();
    setOpenSignOutModalAtom(true);
  }, [onEventEnd, setOpenSignOutModalAtom]);

  const t = useAFFiNEI18N();

  return (
    <div>
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
    </div>
  );
};

export const UserAccountItem = ({
  email,
  onEventEnd,
}: {
  email: string;
  onEventEnd?: () => void;
}) => {
  return (
    <div className={styles.userAccountContainer}>
      <div className={styles.leftContainer}>
        <div className={styles.userEmail}>{email}</div>
        <UserPlanButton />
      </div>
      <Menu
        items={<AccountMenu onEventEnd={onEventEnd} />}
        contentOptions={{
          side: 'right',
          sideOffset: 12,
        }}
      >
        <IconButton
          data-testid="workspace-modal-account-option"
          icon={<MoreHorizontalIcon />}
          type="plain"
        />
      </Menu>
    </div>
  );
};
