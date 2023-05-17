import type { Meta } from '@storybook/react';
import { useSetAtom } from 'jotai';

import { NotificationCenter, notificationsAtom } from './index';

export default {
  title: 'AFFiNE/NotificationCenter',
  component: NotificationCenter,
} satisfies Meta<typeof NotificationCenter>;

let id = 0;
export const Basic = () => {
  const push = useSetAtom(notificationsAtom);
  return (
    <>
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
