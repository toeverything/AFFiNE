import { atom } from 'jotai';

export type Notification = {
  key: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  timeout: number;
  // actions
  undo?: () => Promise<void>;
};

const notificationsBaseAtom = atom<Notification[]>([]);

export const notificationsAtom = atom<
  Notification[],
  [Notification],
  ReturnType<typeof setTimeout>
>(
  get => get(notificationsBaseAtom),
  (get, set, newNotification) => {
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
      ...notifications,
      { ...newNotification, undo },
    ]);
    return setTimeout(() => {
      removeNotification();
    }, newNotification.timeout);
  }
);
