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

import { openSettingModalAtom } from '../../../../../atoms';
import { signOutCloud } from '../../../../../utils/cloud-utils';
import { useNavigateHelper } from '../.././../../../hooks/use-navigate-helper';
import * as styles from './index.css';

const AccountMenu = ({ onEventEnd }: { onEventEnd?: () => void }) => {
  const setSettingModalAtom = useSetAtom(openSettingModalAtom);

  const { jumpToIndex } = useNavigateHelper();

  const onOpenAccountSetting = useCallback(() => {
    setSettingModalAtom(prev => ({
      ...prev,
      open: true,
      activeTab: 'account',
    }));
  }, [setSettingModalAtom]);

  const onSignOut = useCallback(async () => {
    signOutCloud()
      .then(() => {
        jumpToIndex();
      })
      .catch(console.error);
    onEventEnd?.();
  }, [onEventEnd, jumpToIndex]);

  const t = useAFFiNEI18N();

  return (
    <div>
      <MenuItem
        preFix={
          <MenuIcon>
            <AccountIcon />
          </MenuIcon>
        }
        data-testid="editor-option-menu-import"
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
        data-testid="editor-option-menu-import"
        onClick={onSignOut}
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
      <div className={styles.userEmail}>{email}</div>
      <Menu
        items={<AccountMenu onEventEnd={onEventEnd} />}
        contentOptions={{
          side: 'right',
          sideOffset: 12,
        }}
      >
        <IconButton
          data-testid="more-button"
          icon={<MoreHorizontalIcon />}
          type="plain"
        />
      </Menu>
    </div>
  );
};
