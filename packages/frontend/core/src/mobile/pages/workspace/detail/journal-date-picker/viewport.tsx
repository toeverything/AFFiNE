import { useGlobalEvent } from '@affine/core/mobile/hooks/use-global-events';
import { SwipeHelper } from '@affine/core/mobile/utils';
import { animate, eases } from 'animejs';
import clsx from 'clsx';
import dayjs from 'dayjs';
import {
  type HTMLAttributes,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  CELL_HEIGHT,
  DATE_FORMAT,
  MONTH_VIEW_HEIGHT,
  SCROLL_DOWN_TO_FOLD_THRESHOLD,
  WEEK_VIEW_HEIGHT,
} from './constants';
import { JournalDatePickerContext } from './context';
import { MonthView } from './month';
import * as styles from './viewport.css';
import { WeekHeader, WeekRowSwipe } from './week';

export const ResizeViewport = ({
  className,
  ...attrs
}: HTMLAttributes<HTMLDivElement>) => {
  const { selected } = useContext(JournalDatePickerContext);
  const draggableRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const firstDayOfWeek = dayjs(selected).startOf('week').format(DATE_FORMAT);
  const staticHeight = mode === 'week' ? WEEK_VIEW_HEIGHT : MONTH_VIEW_HEIGHT;
  const draggedHeight = Math.max(
    WEEK_VIEW_HEIGHT,
    Math.min(MONTH_VIEW_HEIGHT, staticHeight + dragOffset)
  );

  const handleToggleModeWithAnimation = useCallback(
    (
      targetMode: 'week' | 'month',
      draggedDistance: number,
      isCancel = false
    ) => {
      const targetDragOffset = isCancel
        ? 0
        : targetMode === 'week'
          ? -(MONTH_VIEW_HEIGHT - WEEK_VIEW_HEIGHT)
          : MONTH_VIEW_HEIGHT - WEEK_VIEW_HEIGHT;

      const dragOffsetProxy = new Proxy<{ value: number }>(
        { value: draggedDistance },
        {
          set(target, key, value) {
            if (key !== 'value') return true;
            setDragOffset(value);
            target.value = value;
            return true;
          },
        }
      );

      setIsAnimating(true);
      animate(dragOffsetProxy, {
        value: targetDragOffset,
        duration: 300,
        ease: eases.outCubic,
        onComplete: () => {
          setMode(targetMode);
          setDragOffset(0);
          setIsDragging(false);
          setIsAnimating(false);
        },
      });
    },
    []
  );

  useEffect(() => {
    if (!draggableRef.current) return;

    const swipeHelper = new SwipeHelper();
    return swipeHelper.init(draggableRef.current, {
      preventScroll: true,
      onTap() {
        handleToggleModeWithAnimation(mode === 'week' ? 'month' : 'week', 0);
      },
      onSwipe: ({ deltaY }) => {
        setDragOffset(deltaY);
        setIsDragging(true);
      },
      onSwipeEnd: ({ deltaY, speedY }) => {
        if (Math.abs(deltaY) > 2 * CELL_HEIGHT || speedY > 100) {
          handleToggleModeWithAnimation(
            mode === 'week' ? 'month' : 'week',
            deltaY
          );
        } else {
          handleToggleModeWithAnimation(mode, deltaY, true);
        }
      },
    });
  }, [handleToggleModeWithAnimation, mode]);

  // auto fold when scroll down
  const prevScrollYRef = useRef(window.scrollY);
  useGlobalEvent(
    'scroll',
    useCallback(() => {
      if (mode === 'week') return;
      if (isAnimating) return;
      const offset = window.scrollY - prevScrollYRef.current;
      if (offset >= SCROLL_DOWN_TO_FOLD_THRESHOLD) {
        prevScrollYRef.current = window.scrollY;
        handleToggleModeWithAnimation('week', 0);
      }
    }, [handleToggleModeWithAnimation, isAnimating, mode])
  );
  useGlobalEvent(
    'scrollend',
    useCallback(() => {
      prevScrollYRef.current = window.scrollY;
    }, [])
  );

  return (
    <div className={clsx(styles.root, className)} {...attrs}>
      <WeekHeader className={styles.weekRow} />
      <div ref={viewportRef} style={{ height: draggedHeight }}>
        {mode === 'month' || isDragging || isAnimating ? (
          <MonthView viewportHeight={draggedHeight} />
        ) : (
          <WeekRowSwipe start={firstDayOfWeek} />
        )}
      </div>
      <div className={styles.draggable} ref={draggableRef}>
        <div className={styles.draggableHandle} />
      </div>
    </div>
  );
};
