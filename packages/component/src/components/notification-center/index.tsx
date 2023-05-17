import { useAtomValue } from 'jotai';
import type { ReactElement } from 'react';

import { notificationsAtom } from './index.jotai';

export { notificationsAtom };

export const NotificationCenter = (): ReactElement => {
  const notifications = useAtomValue(notificationsAtom);
  return (
    <div>
      {notifications.map(notification => (
        <div key={notification.key}>{notification.title}</div>
      ))}
    </div>
  );
};
