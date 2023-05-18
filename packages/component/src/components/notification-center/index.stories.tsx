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
      <button
        onClick={() => {
          const key = id++;
          push({
            key: `${key}`,
            title: `${key} title`,
            message: `${key} message`,
            timeout: 2000,
            type: 'info',
          });
        }}
      >
        Push
      </button>
      <NotificationCenter />
    </>
  );
};
