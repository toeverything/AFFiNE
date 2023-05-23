import { CloseIcon, InformationFillIcon } from '@blocksuite/icons';
import * as Toast from '@radix-ui/react-toast';
import clsx from 'clsx';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { MouseEvent, ReactElement } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { IconButton } from '../../ui/button';
import * as styles from './index.css';
import type { Notification } from './index.jotai';
import {
  expandNotificationCenterAtom,
  notificationsAtom,
  pushNotificationAtom,
  removeNotificationAtom,
} from './index.jotai';

// only expose necessary function atom to avoid misuse
export { pushNotificationAtom, removeNotificationAtom };

export type NotificationCardProps = {
  notification: Notification;
  index: number;
};
const typeColorMap = {
  info: {
    light: styles.lightInfoStyle,
    dark: styles.darkInfoStyle,
  },
  success: {
    light: styles.lightSuccessStyle,
    dark: styles.darkSuccessStyle,
  },
  warning: {
    light: styles.lightWarningStyle,
    dark: styles.darkWarningStyle,
  },
  error: {
    light: styles.lightErrorStyle,
    dark: styles.darkErrorStyle,
  },
};
function NotificationCard(props: NotificationCardProps): ReactElement {
  const animateRef = useRef<SVGAnimateElement>(null);
  const [expand, setExpand] = useAtom(expandNotificationCenterAtom);
  const removeNotification = useSetAtom(removeNotificationAtom);
  const { notification, index } = props;
  const [hidden, setHidden] = useState<boolean>(() => !expand && index >= 3);
  const [showCloseAnimate, setShowCloseAnimate] = useState<boolean>(false);
  const [showSlideInAnimate, setSlideInAnimate] = useState<boolean>(true);
  const [notificationHeight, setNotificationHeight] = useState<number>(0);
  const typeStyle =
    typeColorMap[notification.type][notification.theme || 'light'];
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (cardRef.current) {
      const height = cardRef.current.getBoundingClientRect().height;

      setNotificationHeight(height);
    }
  }, [setNotificationHeight]);
  useEffect(() => {
    setTimeout(() => {
      setSlideInAnimate(false);
    }, 300);
  }, []);
  useEffect(() => {
    if (animateRef.current) {
      const animate = animateRef.current;
      const callback = () => {
        setHidden(true);
      };
      animate.addEventListener('endEvent', callback, { once: true });
      return () => {
        animate.removeEventListener('endEvent', callback);
      };
    }
  }, []);

  const onClickRemove = useCallback(() => {
    setShowCloseAnimate(true);
    setTimeout(() => {
      removeNotification(notification.key);
    }, 300);
  }, [notification.key, removeNotification]);

  const onClickUndo = useCallback(() => {
    if (notification.undo) {
      return notification.undo();
    }
  }, [notification]);

  const onClickExpand = useCallback(
    (e: MouseEvent) => {
      if (e.target instanceof SVGElement) {
        return;
      }
      setExpand(expand => !expand);
    },
    [setExpand]
  );

  return (
    <Toast.Root
      className={clsx(styles.notificationStyle, {
        [styles.formSlideToLeftStyle]: showSlideInAnimate && index === 0,
        [styles.formSlideToRightStyle]: showCloseAnimate,
      })}
      style={{
        transition: `opacity 0.3s, margin-bottom 0.3s`,
        marginBottom: '10px',
        transform: expand
          ? 'translateY(0) scale(1)'
          : `translateY(${index * notificationHeight}px) scale(${
              1 - index * 0.02
            })`,
        opacity: hidden ? 0 : !expand && index > 2 ? 0 : 1,
      }}
      open={true}
      onClick={onClickExpand}
    >
      <div
        ref={cardRef}
        className={clsx(styles.notificationContentStyle, {
          [typeStyle]: notification.theme,
          [styles.defaultCollapseStyle[index === 1 ? 'secondary' : 'tertiary']]:
            !expand && index !== 0 && index && !notification.theme,
          [styles.lightCollapseStyle[index === 1 ? 'secondary' : 'tertiary']]:
            !expand && index !== 0 && index && notification.theme === 'light',
          [styles.darkCollapseStyle[index === 1 ? 'secondary' : 'tertiary']]:
            !expand && index !== 0 && index && notification.theme === 'dark',
        })}
      >
        <Toast.Title
          className={clsx(styles.notificationTitleStyle, {
            [styles.darkColorStyle]: notification.theme === 'dark',
          })}
        >
          <div
            className={clsx(styles.notificationIconStyle, {
              [styles.darkColorStyle]: notification.theme === 'dark',
              [styles.lightInfoIconStyle]: notification.theme !== 'dark',
            })}
          >
            <InformationFillIcon />
          </div>
          <div className={styles.notificationTitleContactStyle}>
            {notification.title}
          </div>
          {notification.undo && (
            <div
              className={clsx(styles.undoButtonStyle, {
                [styles.darkColorStyle]: notification.theme === 'dark',
              })}
              onClick={onClickUndo}
            >
              UNDO
            </div>
          )}
          <IconButton
            className={clsx(styles.closeButtonStyle, {
              [styles.closeButtonWithoutUndoStyle]: !notification.undo,
            })}
            style={{
              color:
                notification.theme === 'dark'
                  ? 'var(--affine-white)'
                  : 'var(--affine-icon-color)',
            }}
          >
            <CloseIcon onClick={onClickRemove} />
          </IconButton>
        </Toast.Title>
        <Toast.Description
          className={clsx(styles.messageStyle, {
            [styles.darkColorStyle]: notification.theme === 'dark',
          })}
        >
          {notification.message}
        </Toast.Description>
        {notification.timeout && (
          <div className={styles.progressBarStyle}>
            <svg width="100%" height="4">
              <rect
                width="100%"
                height="4"
                fill="var(--affine-hover-color)"
                rx="2"
                ry="2"
              />
              <rect
                width="0%"
                height="4"
                fill="var(--affine-primary-color)"
                rx="2"
                ry="2"
              >
                <animate
                  ref={animateRef}
                  attributeName="width"
                  from="0%"
                  to="100%"
                  dur={`${(notification.timeout - 100) / 1000}s`}
                  fill="freeze"
                />
              </rect>
            </svg>
          </div>
        )}
      </div>
    </Toast.Root>
  );
}

export function NotificationCenter(): ReactElement {
  const notifications = useAtomValue(notificationsAtom);
  const [expand, setExpand] = useAtom(expandNotificationCenterAtom);

  if (notifications.length === 0 && expand) {
    setExpand(false);
  }
  return (
    <Toast.Provider swipeDirection="right">
      {notifications.map((notification, index) => (
        <NotificationCard
          notification={notification}
          index={index}
          key={notification.key}
        />
      ))}
      <Toast.Viewport className={styles.notificationCenterViewportStyle} />
    </Toast.Provider>
  );
}
