import { uuidv4 } from '@blocksuite/store';
import { atom } from 'jotai';

export type Notification = {
  key?: string;
  title: string;
  message?: string;
  type: 'success' | 'error' | 'warning' | 'info';
  theme?: 'light' | 'dark' | 'default';
  timeout?: number;
  progressingBar?: boolean;
  multimedia?: React.ReactNode | JSX.Element | HTMLElement;
  // actions
  undo?: () => Promise<void>;
};

const notificationsBaseAtom = atom<Notification[]>([]);

const expandNotificationCenterBaseAtom = atom(false);
const cleanupQueueAtom = atom<(() => unknown)[]>([]);
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

export const notificationsAtom = atom<Notification[]>(get =>
  get(notificationsBaseAtom)
);

export const removeNotificationAtom = atom(null, (_, set, key: string) => {
  set(notificationsBaseAtom, notifications =>
    notifications.filter(notification => notification.key !== key)
  );
});

export const pushNotificationAtom = atom<null, [Notification], void>(
  null,
  (_, set, newNotification) => {
    newNotification.key = newNotification.key || uuidv4();
    const key = newNotification.key;
    const removeNotification = () =>
      set(notificationsBaseAtom, notifications =>
        notifications.filter(notification => notification.key !== key)
      );
    const undo: (() => Promise<void>) | undefined = newNotification.undo
      ? (() => {
          const undo: () => Promise<void> = newNotification.undo;
          return async function undoNotificationWrapper() {
            removeNotification();
            return undo();
          };
        })()
      : undefined;

    set(notificationsBaseAtom, notifications => [
      // push to the top
      { ...newNotification, undo },
      ...notifications,
    ]);
  }
);
