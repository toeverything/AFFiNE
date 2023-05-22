import type { Meta } from '@storybook/react';
import { useAtomValue, useSetAtom } from 'jotai';

import { NotificationCenter, notificationsAtom } from './index';
import { expandNotificationCenterAtom } from './index.jotai';

export default {
  title: 'AFFiNE/NotificationCenter',
  component: NotificationCenter,
} satisfies Meta<typeof NotificationCenter>;

let id = 0;
export const Basic = () => {
  const push = useSetAtom(notificationsAtom);
  const expand = useAtomValue(expandNotificationCenterAtom);
  return (
    <>
      <div>{expand ? 'expanded' : 'collapsed'}</div>
      <div>
        <button
          onClick={() => {
            const key = id++;
            push({
              key: `${key}`,
              title: `${key} title`,
              message: `${key} message`,
              timeout: 2000,
              undo: async () => {
                console.log('undo');
              },
              type: 'info',
            });
          }}
        >
          Push timeout notification
        </button>
      </div>
      <div>
        <button
          onClick={() => {
            const key = id++;
            push({
              key: `${key}`,
              title: `${key} title`,
              message: `${key} message`,
              type: 'info',
            });
          }}
        >
          Push notification with no timeout
        </button>
      </div>
      <div>
        <button
          onClick={() => {
            const key = id++;
            push({
              key: `${key}`,
              title: `${key} title`,
              message: ``,
              type: 'info',
            });
          }}
        >
          Push notification with no message
        </button>
      </div>
      <div>
        <button
          onClick={() => {
            const key = id++;
            push({
              key: `${key}`,
              title: `${key} title`,
              message: ``,
              type: 'success',
              theme: 'light',
            });
          }}
        >
          light success
        </button>
      </div>
      <div>
        <button
          onClick={() => {
            const key = id++;
            push({
              key: `${key}`,
              title: `${key} title`,
              message: ``,
              type: 'success',
              theme: 'dark',
            });
          }}
        >
          dark success
        </button>
      </div>
      <NotificationCenter />
    </>
  );
};
