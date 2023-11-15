import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SignOutIcon } from '@blocksuite/icons';
import { Avatar } from '@toeverything/components/avatar';
import { Menu, MenuIcon, MenuItem } from '@toeverything/components/menu';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { useCurrentUser } from '../../../hooks/affine/use-current-user';
import { signOutCloud } from '../../../utils/cloud-utils';
import * as styles from './styles.css';

export const PublishPageUserAvatar = () => {
  const user = useCurrentUser();
  const t = useAFFiNEI18N();
  const location = useLocation();

  const handleSignOut = useAsyncCallback(async () => {
    await signOutCloud({ callbackUrl: location.pathname });
  }, [location.pathname]);

  const menuItem = useMemo(() => {
    return (
      <MenuItem
        preFix={
          <MenuIcon>
            <SignOutIcon />
          </MenuIcon>
        }
        data-testid="share-page-sign-out-option"
        onClick={handleSignOut}
      >
        {t['com.affine.workspace.cloud.account.logout']()}
      </MenuItem>
    );
  }, [handleSignOut, t]);

  return (
    <Menu items={menuItem}>
      <div className={styles.iconWrapper} data-testid="share-page-user-avatar">
        <Avatar size={24} url={user.image} name={user.name} />
      </div>
    </Menu>
  );
};
