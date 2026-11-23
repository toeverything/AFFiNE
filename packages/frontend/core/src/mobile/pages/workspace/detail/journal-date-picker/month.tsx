import { SwipeHelper } from '@affine/core/mobile/utils';
import { animate, eases } from 'animejs';
import clsx from 'clsx';
import dayjs from 'dayjs';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  CELL_HEIGHT,
  DATE_FORMAT,
  HORIZONTAL_SWIPE_THRESHOLD,
  MONTH_VIEW_HEIGHT,
  ROWS_GAP,
  WEEK_VIEW_HEIGHT,
} from './constants';
import { JournalDatePickerContext } from './context';
import * as styles from './month.css';
import { getFirstDayOfMonth } from './utils';
import { WeekRow } from './week';
export interface MonthViewProps {
  viewportHeight: number;
}

function getWeeks(date: string) {
  const today = dayjs(date);
  const firstDayOfMonth = today.startOf('month');
  const firstWeekday = firstDayOfMonth.startOf('week');

  const weeks = [];
  for (let i = 0; i < 6; i++) {
    const week = firstWeekday.add(i * 7, 'day');
    weeks.push(week.format(DATE_FORMAT));
  }

  return weeks;
}

export const MonthView = ({ viewportHeight }: MonthViewProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<HTMLDivElement>(null);
  const { width, selected, onSelect, setCursor } = useContext(
    JournalDatePickerContext
  );
  const [swiping, setSwiping] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [swipingDeltaX, setSwipingDeltaX] = useState(0);

  const weeks = useMemo(
    () => getWeeks(selected ?? dayjs().format(DATE_FORMAT)),
    [selected]
  );

  const firstWeekDayOfSelected = dayjs(selected)
    .startOf('week')
    .format(DATE_FORMAT);
  const activeRowIndex = weeks.indexOf(firstWeekDayOfSelected);

  // pointA: (WEEK_VIEW_HEIGHT, maxY)
  // pointB: (MONTH_VIEW_HEIGHT, 0)
  const maxY = -(activeRowIndex * (CELL_HEIGHT + ROWS_GAP));
  const k = maxY / (WEEK_VIEW_HEIGHT - MONTH_VIEW_HEIGHT);
  const b = -k * MONTH_VIEW_HEIGHT;
  const translateY = k * viewportHeight + b;

  const translateX = Math.max(-width, Math.min(width, swipingDeltaX));

  const animateTo = useCallback(
    (dir: 0 | 1 | -1) => {
      if (!swipeRef.current) return;
      setAnimating(true);

      animate(swipeRef.current, {
        translateX: -dir * width,
        duration: 300,
        ease: eases.inOutSine,
        onComplete: () => {
          setSwipingDeltaX(0);
          setAnimating(false);
          // should recover swipe before change month
          if (dir !== 0) {
            setTimeout(() => onSelect(getFirstDayOfMonth(selected, dir)));
          }
        },
      });
    },
    [onSelect, selected, width]
  );

  useEffect(() => {
    if (!rootRef.current) return;
    const swipeHelper = new SwipeHelper();
    return swipeHelper.init(rootRef.current, {
      preventScroll: true,
      onSwipe: ({ deltaX }) => {
        setSwiping(true);
        setSwipingDeltaX(deltaX);
        if (Math.abs(deltaX) > HORIZONTAL_SWIPE_THRESHOLD) {
          setCursor(getFirstDayOfMonth(selected, deltaX > 0 ? -1 : 1));
        } else {
          setCursor(selected);
        }
      },
      onSwipeEnd: ({ deltaX, speedX }) => {
        setSwiping(false);
        if (Math.abs(deltaX) > HORIZONTAL_SWIPE_THRESHOLD || speedX > 100) {
          animateTo(deltaX > 0 ? -1 : 1);
        } else {
          animateTo(0);
        }
      },
    });
  }, [animateTo, selected, setCursor]);

  return (
    <div className={styles.monthViewClip} ref={rootRef}>
      <div
        ref={swipeRef}
        className={styles.monthsSwipe}
        style={{ transform: `translateX(${translateX}px)` }}
      >
        <MonthGrid
          hidden={!swiping && !animating}
          date={getFirstDayOfMonth(selected, -1)}
        />
        {/* Active month */}
        <MonthGrid
          style={{ transform: `translateY(${translateY}px)` }}
          date={selected ?? ''}
        />
        <MonthGrid
          hidden={!swiping && !animating}
          date={getFirstDayOfMonth(selected, 1)}
        />
      </div>
    </div>
  );
};

interface MonthGridProps extends React.HTMLAttributes<HTMLDivElement> {
  date: string;
  hidden?: boolean;
}
const MonthGrid = ({ date, className, hidden, ...props }: MonthGridProps) => {
  const weeks = useMemo(
    () => getWeeks(date ?? dayjs().format(DATE_FORMAT)),
    [date]
  );

  return (
    <div className={clsx(styles.monthView, className)} {...props}>
      {hidden ? null : weeks.map(week => <WeekRow key={week} start={week} />)}
    </div>
  );
};
