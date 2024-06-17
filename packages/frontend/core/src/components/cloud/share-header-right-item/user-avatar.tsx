import { Avatar } from '@affine/component/ui/avatar';
import {
  Menu,
  MenuIcon,
  MenuItem,
  MenuSeparator,
} from '@affine/component/ui/menu';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SignOutIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect, useMemo } from 'react';

import { AuthService, SubscriptionService } from '../../../modules/cloud';
import * as styles from './styles.css';

const UserInfo = () => {
  const authService = useService(AuthService);
  const user = useLiveData(authService.session.account$);
  const subscription = useService(SubscriptionService).subscription;
  useEffect(() => {
    subscription.revalidate();
  }, [subscription]);
  const plan = useLiveData(subscription.pro$)?.plan;

  if (!user) {
    // TODO: loading UI
    return null;
  }
  return (
    <div className={styles.accountCard}>
      <Avatar
        size={28}
        name={user.label}
        url={user.avatar}
        className={styles.avatar}
      />

      <div className={styles.content}>
        <div className={styles.nameContainer}>
          <div className={styles.userName} title={user.label}>
            {user.label}
          </div>
          {plan && <div className={styles.userPlanButton}>{plan}</div>}
        </div>
        <div className={styles.userEmail} title={user.email}>
          {user.email}
        </div>
      </div>
    </div>
  );
};

export const PublishPageUserAvatar = () => {
  const authService = useService(AuthService);
  const user = useLiveData(authService.session.account$);
  const t = useAFFiNEI18N();

  const handleSignOut = useAsyncCallback(async () => {
    await authService.signOut();
  }, [authService]);

  const menuItem = useMemo(() => {
    return (
      <>
        <UserInfo />
        <MenuSeparator />
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
      </>
    );
  }, [handleSignOut, t]);

  if (!user) {
    return null;
  }

  return (
    <Menu
      items={menuItem}
      contentOptions={{
        style: {
          transform: 'translateX(-16px)',
        },
      }}
    >
      <div className={styles.iconWrapper} data-testid="share-page-user-avatar">
        <Avatar size={24} url={user.avatar} name={user.label} />
      </div>
    </Menu>
  );
};
