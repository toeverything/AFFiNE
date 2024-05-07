import { atom } from 'jotai';
import { nanoid } from 'nanoid';

/**
 * @deprecated use `import type { Notification } from '@affine/component'` instead
 */
export type Notification = {
  key?: string;
  title: string;
  message?: string;
  type: 'success' | 'error' | 'warning' | 'info';
  theme?: 'light' | 'dark' | 'default';
  timeout?: number;
  progressingBar?: boolean;
  multimedia?: React.ReactNode | JSX.Element;
  // actions
  action?: () => Promise<void>;
  actionLabel?: string;
};

const notificationsBaseAtom = atom<Notification[]>([]);

const expandNotificationCenterBaseAtom = atom(false);
const cleanupQueueAtom = atom<(() => unknown)[]>([]);
/**
 * @deprecated use `import { notify } from '@affine/component'` instead
 */
export const expandNotificationCenterAtom = atom<boolean, [boolean], void>(
  get => get(expandNotificationCenterBaseAtom),
  (get, set, value) => {
    if (value === false) {
      get(cleanupQueueAtom).forEach(cleanup => cleanup());
      set(cleanupQueueAtom, []);
    }
    set(expandNotificationCenterBaseAtom, value);
  }
);
/**
 * @deprecated use `import { notify } from '@affine/component'` instead
 */
export const notificationsAtom = atom<Notification[]>(get =>
  get(notificationsBaseAtom)
);
/**
 * @deprecated use `import { notify } from '@affine/component'` instead
 */
export const removeNotificationAtom = atom(null, (_, set, key: string) => {
  set(notificationsBaseAtom, notifications =>
    notifications.filter(notification => notification.key !== key)
  );
});

/**
 * @deprecated use `import { notify } from '@affine/component'` instead
 */
export const pushNotificationAtom = atom<null, [Notification], void>(
  null,
  (_, set, newNotification) => {
    newNotification.key = newNotification.key || nanoid();
    const key = newNotification.key;
    const removeNotification = () =>
      set(notificationsBaseAtom, notifications =>
        notifications.filter(notification => notification.key !== key)
      );
    const action: (() => Promise<void>) | undefined = newNotification.action
      ? (() => {
          const action: () => Promise<void> = newNotification.action;
          return async function actionNotificationWrapper() {
            removeNotification();
            return action();
          };
        })()
      : undefined;

    set(notificationsBaseAtom, notifications => [
      // push to the top
      { ...newNotification, action },
      ...notifications,
    ]);
  }
);
