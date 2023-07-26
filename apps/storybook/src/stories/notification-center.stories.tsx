import {
  expandNotificationCenterAtom,
  NotificationCenter,
  pushNotificationAtom,
} from '@affine/component/notification-center';
import type { Meta } from '@storybook/react';
import { useAtomValue, useSetAtom } from 'jotai';

export default {
  title: 'AFFiNE/NotificationCenter',
  component: NotificationCenter,
} satisfies Meta<typeof NotificationCenter>;

let id = 0;
const image = (
  <img
    src="https://cdn.affine.pro/94d27d73c5767986d26b81a0ced25ac6ab16686971734ba0d9c0987c.gif"
    alt="gif"
  />
);
export const Basic = () => {
  const push = useSetAtom(pushNotificationAtom);
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
              timeout: 3000,
              progressingBar: true,
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
      <div>
        <button
          onClick={() => {
            const key = id++;
            push({
              key: `${key}`,
              title: `${key} title`,
              message: ``,
              type: 'info',
              theme: 'light',
            });
          }}
        >
          light info
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
              theme: 'dark',
            });
          }}
        >
          dark info
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
              type: 'warning',
              theme: 'light',
            });
          }}
        >
          light warning
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
              type: 'warning',
              theme: 'dark',
            });
          }}
        >
          dark warning
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
              type: 'error',
              theme: 'light',
            });
          }}
        >
          light error
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
              type: 'error',
              theme: 'dark',
            });
          }}
        >
          dark error
        </button>
      </div>
      <div>
        <button
          onClick={() => {
            const key = id++;
            push({
              key: `${key}`,
              title: `${key} title`,
              message: `gif test`,
              type: 'info',
              multimedia: image,
              timeout: 3000,
            });
          }}
        >
          gif
        </button>
      </div>
      <NotificationCenter />
    </>
  );
};
