import { Menu } from '@affine/component';
import { MenuItem } from '@affine/core/modules/app-sidebar/views';
import { NotificationCountService } from '@affine/core/modules/notification';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { NotificationIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { NotificationList } from '../notification/list';
import * as styles from './notification-button.style.css';

const Badge = ({ count, onClick }: { count: number; onClick?: () => void }) => {
  if (count === 0) {
    return null;
  }
  return (
    <div className={styles.badge} onClick={onClick}>
      {count > 99 ? '99+' : count}
    </div>
  );
};

export const NotificationButton = () => {
  const notificationCountService = useService(NotificationCountService);
  const notificationCount = useLiveData(notificationCountService.count$);

  const t = useI18n();

  const [notificationListOpen, setNotificationListOpen] = useState(false);

  const handleNotificationListOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        track.$.sidebar.notifications.openInbox({
          unreadCount: notificationCountService.count$.value,
        });
      }
      setNotificationListOpen(open);
    },
    [notificationCountService.count$.value]
  );

  return (
    <Menu
      rootOptions={{
        open: notificationListOpen,
        onOpenChange: handleNotificationListOpenChange,
      }}
      contentOptions={{
        side: 'right',
        sideOffset: -50,
      }}
      items={<NotificationList />}
    >
      <MenuItem
        icon={<NotificationIcon />}
        postfix={<Badge count={notificationCount} />}
        active={notificationListOpen}
        postfixDisplay="always"
      >
        <span data-testid="notification-button">
          {t['com.affine.rootAppSidebar.notifications']()}
        </span>
      </MenuItem>
    </Menu>
  );
};
