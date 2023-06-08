// Credits to sonner
// License on the MIT
// https://github.com/emilkowalski/sonner/blob/5cb703edc108a23fd74979235c2f3c4005edd2a7/src/index.tsx

import { CloseIcon, InformationFillIcon } from '@blocksuite/icons';
import * as Toast from '@radix-ui/react-toast';
import clsx from 'clsx';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { ReactElement } from 'react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { IconButton } from '../../ui/button';
import * as styles from './index.css';
import type { Notification } from './index.jotai';
import {
  expandNotificationCenterAtom,
  notificationsAtom,
  pushNotificationAtom,
  removeNotificationAtom,
} from './index.jotai';

export {
  expandNotificationCenterAtom,
  pushNotificationAtom,
  removeNotificationAtom,
};
type Height = {
  height: number;
  notificationKey: number | string;
};
export type NotificationCardProps = {
  notification: Notification;
  notifications: Notification[];
  index: number;
  heights: Height[];
  setHeights: React.Dispatch<React.SetStateAction<Height[]>>;
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
  const removeNotification = useSetAtom(removeNotificationAtom);
  const { notification, notifications, setHeights, heights, index } = props;
  const [expand, setExpand] = useAtom(expandNotificationCenterAtom);
  // const setNotificationRemoveAnimation = useSetAtom(notificationRemoveAnimationAtom);
  const [mounted, setMounted] = useState<boolean>(false);
  const [removed, setRemoved] = useState<boolean>(false);
  const [swiping, setSwiping] = useState<boolean>(false);
  const [swipeOut, setSwipeOut] = useState<boolean>(false);
  const [offsetBeforeRemove, setOffsetBeforeRemove] = useState<number>(0);
  const [initialHeight, setInitialHeight] = useState<number>(0);
  const [animationKey, setAnimationKey] = useState(0);
  const animationRef = useRef<SVGAnimateElement>(null);
  const notificationRef = useRef<HTMLLIElement>(null);
  const timerIdRef = useRef<NodeJS.Timeout>();
  const isFront = index === 0;
  const isVisible = index + 1 <= 3;
  const progressDuration = notification.timeout || 3000;
  const heightIndex = useMemo(
    () =>
      heights.findIndex(
        height => height.notificationKey === notification.key
      ) || 0,
    [heights, notification.key]
  );
  const duration = notification.timeout || 3000;
  const offset = useRef(0);
  const pointerStartYRef = useRef<number | null>(null);
  const notificationsHeightBefore = useMemo(() => {
    return heights.reduce((prev, curr, reducerIndex) => {
      // Calculate offset up untill current  notification
      if (reducerIndex >= heightIndex) {
        return prev;
      }

      return prev + curr.height;
    }, 0);
  }, [heights, heightIndex]);

  offset.current = useMemo(
    () => heightIndex * 14 + notificationsHeightBefore,
    [heightIndex, notificationsHeightBefore]
  );

  useEffect(() => {
    // Trigger enter animation without using CSS animation
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!expand) {
      animationRef.current?.beginElement();
    }
  }, [expand]);

  const resetAnimation = () => {
    setAnimationKey(prevKey => prevKey + 1);
  };
  useLayoutEffect(() => {
    if (!mounted) return;
    if (!notificationRef.current) return;
    const notificationNode = notificationRef.current;
    const originalHeight = notificationNode.style.height;
    notificationNode.style.height = 'auto';
    const newHeight = notificationNode.getBoundingClientRect().height;
    notificationNode.style.height = originalHeight;

    setInitialHeight(newHeight);

    setHeights(heights => {
      const alreadyExists = heights.find(
        height => height.notificationKey === notification.key
      );
      if (!alreadyExists) {
        return [
          { notificationKey: notification.key, height: newHeight },
          ...heights,
        ];
      } else {
        return heights.map(height =>
          height.notificationKey === notification.key
            ? { ...height, height: newHeight }
            : height
        );
      }
    });
  }, [notification.title, notification.key, mounted, setHeights]);

  const typeStyle =
    typeColorMap[notification.type][notification.theme || 'light'];

  const onClickRemove = useCallback(() => {
    // Save the offset for the exit swipe animation
    setRemoved(true);
    setOffsetBeforeRemove(offset.current);
    setHeights(h =>
      h.filter(height => height.notificationKey !== notification.key)
    );
    setTimeout(() => {
      removeNotification(notification.key);
    }, 200);
  }, [setHeights, notification.key, removeNotification, offset]);

  useEffect(() => {
    if (timerIdRef.current) {
      clearTimeout(timerIdRef.current);
    }
    if (!expand) {
      timerIdRef.current = setTimeout(() => {
        onClickRemove();
      }, duration);
    }
    return () => {
      if (timerIdRef.current) {
        clearTimeout(timerIdRef.current);
      }
    };
  }, [duration, expand, onClickRemove]);

  const onClickUndo = useCallback(() => {
    if (notification.undo) {
      return notification.undo();
    }
  }, [notification]);

  useEffect(() => {
    const notificationNode = notificationRef.current;

    if (notificationNode) {
      const height = notificationNode.getBoundingClientRect().height;

      // Add toast height tot heights array after the toast is mounted
      setInitialHeight(height);
      setHeights(h => [{ notificationKey: notification.key, height }, ...h]);

      return () =>
        setHeights(h =>
          h.filter(height => height.notificationKey !== notification.key)
        );
    }
  }, [notification.key, setHeights]);
  return (
    <Toast.Root
      className={clsx(styles.notificationStyle, {
        [styles.lightCollapseStyle[index === 1 ? 'secondary' : 'tertiary']]:
          !isFront && !expand && notification.theme === 'light',
        [styles.darkCollapseStyle[index === 1 ? 'secondary' : 'tertiary']]:
          !isFront && !expand && notification.theme === 'dark',
        [styles.defaultCollapseStyle[index === 1 ? 'secondary' : 'tertiary']]:
          !isFront && !expand && !notification.theme,
      })}
      duration={Infinity}
      aria-live="polite"
      aria-atomic="true"
      role="status"
      tabIndex={0}
      ref={notificationRef}
      data-mounted={mounted}
      data-removed={removed}
      data-visible={isVisible}
      data-index={index}
      data-front={isFront}
      data-swiping={swiping}
      data-swipe-out={swipeOut}
      data-expanded={expand}
      onMouseEnter={() => {
        setExpand(true);
      }}
      onMouseMove={() => {
        setExpand(true);
      }}
      onMouseLeave={() => {
        setExpand(false);
      }}
      style={
        {
          '--index': index,
          '--toasts-before': index,
          '--z-index': notifications.length - index,
          '--offset': `${removed ? offsetBeforeRemove : offset.current}px`,
          '--initial-height': `${initialHeight}px`,
        } as React.CSSProperties
      }
      onPointerDown={event => {
        setOffsetBeforeRemove(offset.current);
        (event.target as HTMLElement).setPointerCapture(event.pointerId);
        if ((event.target as HTMLElement).tagName === 'BUTTON') return;
        setSwiping(true);
        pointerStartYRef.current = event.clientY;
      }}
      onPointerUp={() => {
        if (swipeOut) return;
        const swipeAmount = Number(
          notificationRef.current?.style
            .getPropertyValue('--swipe-amount')
            .replace('px', '') || 0
        );
        if (Math.abs(swipeAmount) >= 20) {
          setOffsetBeforeRemove(offset.current);
          onClickRemove();
          setSwipeOut(true);
          return;
        }

        notificationRef.current?.style.setProperty('--swipe-amount', '0px');
        pointerStartYRef.current = null;
        setSwiping(false);
      }}
      onPointerMove={event => {
        if (!pointerStartYRef.current) return;
        const yPosition = event.clientY - pointerStartYRef.current;

        const isAllowedToSwipe = yPosition > 0;

        if (!isAllowedToSwipe) {
          notificationRef.current?.style.setProperty('--swipe-amount', '0px');
          return;
        }

        notificationRef.current?.style.setProperty(
          '--swipe-amount',
          `${yPosition}px`
        );
      }}
    >
      <div
        className={clsx(styles.notificationContentStyle, {
          [typeStyle]: notification.theme,
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
        {notification.progressingBar && (
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
                  key={animationKey}
                  ref={animationRef}
                  attributeName="width"
                  from="0%"
                  to="100%"
                  dur={(progressDuration - 200) / 1000}
                  fill="freeze"
                  onAnimationEnd={resetAnimation}
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
  const [heights, setHeights] = useState<Height[]>([]);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    // Ensure expanded is always false when no toasts are present / only one left
    if (notifications.length <= 1) {
      setExpand(false);
    }
  }, [notifications, setExpand]);

  if (!notifications.length) return <></>;
  return (
    <Toast.Provider swipeDirection="right">
      {notifications.map((notification, index) => (
        <NotificationCard
          notification={notification}
          index={index}
          key={notification.key}
          notifications={notifications}
          heights={heights}
          setHeights={setHeights}
        />
      ))}
      <Toast.Viewport
        tabIndex={-1}
        ref={listRef}
        style={
          {
            '--front-toast-height': `${heights[0]?.height}px`,
          } as React.CSSProperties
        }
        className={styles.notificationCenterViewportStyle}
      />
    </Toast.Provider>
  );
}
