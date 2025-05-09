import { LiveData, useLiveData, useService } from '@toeverything/infra';
import { animate as anime, eases } from 'animejs';
import clsx from 'clsx';
import {
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
} from 'react';

import { HapticsService } from '../../modules/haptics';
import { SwipeHelper } from '../../utils';
import * as styles from './styles.css';

export interface SwipeMenuProps extends HTMLAttributes<HTMLDivElement> {
  menu: ReactNode;
  /**
   * if the swipe distance is greater than the threshold, will execute the callback
   * @default 200
   */
  executeThreshold?: number;
  onExecute?: () => void;
  normalWidth?: number;
}

type TickFunc<T extends Array<any> = any[]> = (
  content: HTMLDivElement,
  menu: HTMLDivElement,
  options: {
    deltaX: number;
    normalWidth: number;
  },
  ...args: T
) => void;

const tick: TickFunc = (content, menu, options) => {
  const limitedDeltaX = Math.min(
    0,
    Math.max(options.deltaX, -options.normalWidth * 3)
  );
  content.style.transform = `translateX(${limitedDeltaX}px)`;
  menu.style.transform = `translateX(${limitedDeltaX}px)`;
  menu.style.width = `${Math.max(options.normalWidth, Math.abs(limitedDeltaX))}px`;
};

const animate: TickFunc<[number]> = (content, menu, options, to) => {
  const styleX = Number(content.style.transform.match(/-?\d+/)?.[0]);
  const deltaX = isNaN(styleX) ? options.deltaX : styleX;

  const proxy = new Proxy(
    { deltaX },
    {
      set(target, key, value) {
        if (key !== 'deltaX') return true;
        target.deltaX = value;
        tick(content, menu, { ...options, deltaX: value });
        return true;
      },
    }
  );
  if (deltaX === to) return;
  anime(proxy, {
    deltaX: to,
    duration: 230,
    ease: eases.inOutSine,
  });
};

const activeId$ = new LiveData<string | null>(null);

/**
 * Only support swipe left yet
 * Only support single menu item yet
 */
export const SwipeMenu = ({
  children,
  className,
  menu,
  normalWidth = 90,
  executeThreshold = 200,
  onExecute,
  ...props
}: SwipeMenuProps) => {
  const id = useId();
  const haptics = useService(HapticsService);
  const activeId = useLiveData(activeId$);

  const isOpenRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    isOpenRef.current = false;
    const content = contentRef.current;
    const menu = menuRef.current;
    if (!content || !menu) return;
    animate(content, menu, { deltaX: -normalWidth, normalWidth }, 0);
  }, [normalWidth]);

  useEffect(() => {
    if (activeId && activeId !== id && isOpenRef.current) {
      handleClose();
    }
  }, [activeId, handleClose, id]);

  useEffect(() => {
    const container = containerRef.current;
    const menu = menuRef.current;
    const content = contentRef.current;
    if (!container || !menu || !content) return;
    const swipeHelper = new SwipeHelper();

    let shouldExecute = false;

    return swipeHelper.init(container, {
      preventScroll: true,
      direction: 'horizontal',
      onSwipeStart() {
        activeId$.next(id);
      },
      onSwipe({ deltaX: dragX, initialDirection }) {
        if (initialDirection !== 'horizontal') return;

        const deltaX = isOpenRef.current ? dragX - normalWidth : dragX;
        const prevShouldExecute = shouldExecute;
        shouldExecute = deltaX < -executeThreshold;
        if (shouldExecute && !prevShouldExecute) {
          haptics.impact({ style: 'LIGHT' });
        }
        tick(content, menu, { deltaX, normalWidth });
      },
      onSwipeEnd({ deltaX: dragX, initialDirection }) {
        activeId$.next(null);
        if (initialDirection !== 'horizontal') return;

        const deltaX = isOpenRef.current ? dragX - normalWidth : dragX;
        if (shouldExecute) {
          animate(content, menu, { deltaX, normalWidth }, 0);
          onExecute?.();
          isOpenRef.current = false;
          return;
        }
        // open
        if (deltaX < -normalWidth / 2) {
          animate(content, menu, { deltaX, normalWidth }, -normalWidth);
          isOpenRef.current = true;
        }
        // close
        else {
          animate(content, menu, { deltaX, normalWidth }, 0);
          isOpenRef.current = false;
        }
      },
    });
  }, [executeThreshold, haptics, id, normalWidth, onExecute]);

  return (
    <div
      className={clsx(styles.container, className)}
      ref={containerRef}
      {...props}
    >
      <div className={styles.content} ref={contentRef}>
        {children}
      </div>
      <div className={styles.menu} ref={menuRef} onClick={handleClose}>
        {menu}
      </div>
    </div>
  );
};
