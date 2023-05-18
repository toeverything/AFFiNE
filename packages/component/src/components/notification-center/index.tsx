import * as Toast from '@radix-ui/react-toast';
import { useAtom, useAtomValue } from 'jotai';
import type { ReactElement } from 'react';

import {
  notificationCenterViewportStyle,
  notificationStyle,
} from './index.css';
import { expandNotificationCenterAtom, notificationsAtom } from './index.jotai';

export { notificationsAtom };

export const NotificationCenter = (): ReactElement => {
  const notifications = useAtomValue(notificationsAtom);
  const [expand, setExpand] = useAtom(expandNotificationCenterAtom);

  if (notifications.length === 0 && expand) {
    setExpand(false);
  }
  return (
    <Toast.Provider swipeDirection="right">
      {notifications.map((notification, index) => {
        let hidden = false;
        if (!expand && index >= 3) {
          hidden = true;
        }
        return (
          <Toast.Root
            onClick={() => {
              setExpand(!expand);
            }}
            key={notification.key}
            className={notificationStyle}
            style={{
              transition: 'transform 0.3s, opacity 0.3s, margin-bottom 0.3s',
              marginBottom: !expand ? '0' : '1rem',
              transform: expand
                ? 'translateY(0) scale(1)'
                : `translateY(${index * 9}px) scale(${1 - index * 0.02})`,
              opacity: expand ? '1' : hidden ? '0' : 1 - index * 0.1,
            }}
            open={true}
          >
            <Toast.Title>{notification.title}</Toast.Title>
          </Toast.Root>
        );
      })}
      <Toast.Viewport className={notificationCenterViewportStyle} />
    </Toast.Provider>
  );
};
