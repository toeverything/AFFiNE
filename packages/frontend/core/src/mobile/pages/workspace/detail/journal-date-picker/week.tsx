import { SwipeHelper } from '@affine/core/mobile/utils';
import { useI18n } from '@affine/i18n';
import { animate, eases } from 'animejs';
import clsx from 'clsx';
import dayjs from 'dayjs';
import {
  type HTMLAttributes,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { DATE_FORMAT, HORIZONTAL_SWIPE_THRESHOLD } from './constants';
import { JournalDatePickerContext } from './context';
import { DayCell } from './day-cell';
import { getFirstDayOfWeek } from './utils';
import * as styles from './week.css';

export interface WeekRowProps extends HTMLAttributes<HTMLDivElement> {
  start: string;
}
export const WeekHeader = memo(function WeekHeader({
  className,
  ...attrs
}: HTMLAttributes<HTMLDivElement>) {
  const t = useI18n();

  const days = useMemo(
    () => t['com.affine.calendar-date-picker.week-days']().split(','),
    [t]
  );
  return (
    <div className={clsx(styles.weekRow, className)} {...attrs}>
      {days.map(day => {
        return (
          <div className={styles.weekHeaderCell} key={day}>
            {day}
          </div>
        );
      })}
    </div>
  );
});

export const WeekRow = memo(function WeekRow({
  start,
  className,
  ...attrs
}: WeekRowProps) {
  const days = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(dayjs(start).add(i, 'day').format(DATE_FORMAT));
    }
    return days;
  }, [start]);

  return (
    <div className={clsx(styles.weekRow, className)} {...attrs}>
      {days.map(day => (
        <DayCell date={day} key={day} />
      ))}
    </div>
  );
});

export const WeekRowSwipe = ({ start }: WeekRowProps) => {
  const { width, onSelect, setCursor } = useContext(JournalDatePickerContext);
  const rootRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<HTMLDivElement>(null);
  const [swiping, setSwiping] = useState(false);
  const [swipingDeltaX, setSwipingDeltaX] = useState(0);
  const [animating, setAnimating] = useState(false);

  const translateX = Math.max(-width, Math.min(width, swipingDeltaX));

  const animateTo = useCallback(
    (dir: 0 | 1 | -1) => {
      setAnimating(true);

      if (!swipeRef.current) return;
      animate(swipeRef.current, {
        translateX: -dir * width,
        ease: eases.inOutSine,
        duration: 300,
        onComplete: () => {
          setSwipingDeltaX(0);
          setAnimating(false);
          if (dir !== 0) {
            setTimeout(() => onSelect(getFirstDayOfWeek(start, dir)));
          }
        },
      });
    },
    [onSelect, start, width]
  );

  useEffect(() => {
    if (!rootRef.current) return;

    const swipeHelper = new SwipeHelper();
    return swipeHelper.init(rootRef.current, {
      preventScroll: true,
      onSwipe({ deltaX }) {
        setSwiping(true);
        setSwipingDeltaX(deltaX);

        if (Math.abs(deltaX) > HORIZONTAL_SWIPE_THRESHOLD) {
          setCursor(getFirstDayOfWeek(start, deltaX > 0 ? -1 : 1));
        } else {
          setCursor(start);
        }
      },
      onSwipeEnd({ deltaX, speedX }) {
        setSwiping(false);

        if (Math.abs(deltaX) > HORIZONTAL_SWIPE_THRESHOLD || speedX > 100) {
          animateTo(deltaX > 0 ? -1 : 1);
        } else {
          animateTo(0);
        }
      },
    });
  }, [animateTo, setCursor, start]);

  return (
    <div ref={rootRef} className={styles.weekSwipeRoot}>
      <div
        ref={swipeRef}
        className={styles.weekSwipeSlide}
        style={{ transform: `translateX(${translateX}px)` }}
      >
        {swiping || animating ? (
          <WeekRow
            className={styles.weekSwipeItem}
            start={getFirstDayOfWeek(start, -1)}
          />
        ) : (
          <div className={styles.weekSwipeItem} />
        )}
        <WeekRow className={styles.weekSwipeItem} start={start} />
        {swiping || animating ? (
          <WeekRow
            className={styles.weekSwipeItem}
            start={getFirstDayOfWeek(start, 1)}
          />
        ) : (
          <div className={styles.weekSwipeItem} />
        )}
      </div>
    </div>
  );
};
