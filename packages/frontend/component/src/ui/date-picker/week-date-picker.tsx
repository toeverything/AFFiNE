import { ArrowLeftSmallIcon, ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import dayjs from 'dayjs';
import type { ForwardedRef, HTMLAttributes } from 'react';
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { observeResize } from '../../utils';
import { IconButton } from '../button';
import * as styles from './week-date-picker.css';

export interface WeekDatePickerHandle {
  /** control cursor manually */
  setCursor?: (cursor: dayjs.Dayjs) => void;
}

export interface WeekDatePickerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value?: string;
  onChange?: (value: string) => void;
  handleRef?: ForwardedRef<WeekDatePickerHandle>;
}

// TODO(catsjuice): i18n
const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
const format = 'YYYY-MM-DD';

export const WeekDatePicker = memo(function WeekDatePicker({
  value,
  onChange,
  className,
  handleRef,
  ...attrs
}: WeekDatePickerProps) {
  const weekRef = useRef<HTMLDivElement | null>(null);

  const [cursor, setCursor] = useState(dayjs(value));
  const [dense, setDense] = useState(false);
  const [viewPortSize, setViewPortSize] = useState(7);

  useImperativeHandle(handleRef, () => ({
    setCursor,
  }));

  const range = useMemo(() => {
    if (viewPortSize === 7) return [0, 7];
    const cursorIndex = cursor.day();
    let start = Math.max(0, cursorIndex - Math.floor(viewPortSize / 2));
    const end = Math.min(7, start + viewPortSize);
    if (end === 7) start = 7 - viewPortSize;
    return [start, end];
  }, [cursor, viewPortSize]);
  const allDays = useMemo(
    () =>
      Array.from({ length: 7 }).map((_, index) =>
        cursor.startOf('week').add(index, 'day').startOf('day')
      ),
    [cursor]
  );
  const displayDays = useMemo(() => allDays.slice(...range), [allDays, range]);

  const onNext = useCallback(() => {
    const viewPortSize = displayDays.length;
    if (viewPortSize === 7) setCursor(c => c.add(1, 'week'));
    else {
      setCursor(c => {
        // last day of week is visible, move to next weeks
        if (
          displayDays[displayDays.length - 1].isSame(c.endOf('week'), 'day')
        ) {
          return c
            .add(1, 'week')
            .startOf('week')
            .add(Math.floor(viewPortSize / 2), 'day');
        }
        let nextDay = c.add(viewPortSize, 'day');
        if (!nextDay.isSame(c, 'week')) nextDay = c.endOf('week');
        return nextDay;
      });
    }
  }, [displayDays]);
  const onPrev = useCallback(() => {
    const viewPortSize = displayDays.length;
    if (viewPortSize === 7) setCursor(c => c.add(-1, 'week'));
    else
      setCursor(c => {
        // first day of week is visible, move to prev weeks
        if (displayDays[0].isSame(c.startOf('week'), 'day')) {
          return c
            .subtract(1, 'week')
            .endOf('week')
            .subtract(Math.floor(viewPortSize / 2) - 1, 'day');
        }
        let prevDay = c.add(-viewPortSize, 'day');
        if (!prevDay.isSame(c, 'week')) prevDay = c.startOf('week');
        return prevDay;
      });
  }, [displayDays]);
  const onDayClick = useCallback(
    (day: dayjs.Dayjs) => {
      onChange?.(day.format(format));
    },
    [onChange]
  );

  // Observe weekRef to update viewPortSize
  useEffect(() => {
    const el = weekRef.current;
    if (!el) return;

    return observeResize(el, ({ contentRect: rect }) => {
      const width = rect.width;
      if (!width) return;

      const minWidth = 30;
      const gap = 4;
      const viewPortCount = Math.floor(width / (minWidth + gap));
      setViewPortSize(Math.max(1, Math.min(viewPortCount, 7)));
      setDense(width < 300);
    });
  }, []);

  // when value changes, reset cursor
  useEffect(() => {
    value && setCursor(dayjs(value));
  }, [value]);

  const focusCursorCell = useCallback(() => {
    if (!weekRef.current) return;
    const cursorCell = weekRef.current.querySelector(
      'button[tabIndex="0"]'
    ) as HTMLButtonElement;
    cursorCell?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!weekRef.current) return;
    const el = weekRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();
      setCursor(cursor => cursor.add(e.key === 'ArrowLeft' ? -1 : 1, 'day'));
      setTimeout(focusCursorCell);
    };

    el.addEventListener('keydown', onKeyDown);

    return () => {
      el.removeEventListener('keydown', onKeyDown);
    };
  }, [focusCursorCell, onNext, onPrev]);

  return (
    <div className={clsx(styles.weekDatePicker, className)} {...attrs}>
      <IconButton onClick={onPrev} data-testid="week-picker-prev">
        <ArrowLeftSmallIcon />
      </IconButton>

      <div ref={weekRef} className={styles.weekDatePickerContent}>
        {displayDays.map(day => (
          <Cell
            key={day.toISOString()}
            dense={dense}
            value={value}
            day={day}
            cursor={cursor}
            onClick={onDayClick}
          />
        ))}
      </div>

      <IconButton onClick={onNext} data-testid="week-picker-next">
        <ArrowRightSmallIcon />
      </IconButton>
    </div>
  );
});

interface CellProps {
  dense: boolean;
  day: dayjs.Dayjs;
  cursor: dayjs.Dayjs;
  value?: string;
  onClick: (day: dayjs.Dayjs) => void;
}
const Cell = ({ day, dense, value, cursor, onClick }: CellProps) => {
  const isActive = day.format(format) === value;
  const isCurrentMonth = day.month() === cursor.month();
  const isToday = day.isSame(dayjs(), 'day');

  const dayIndex = day.day();
  const label = weekDays[dayIndex];

  return (
    <button
      tabIndex={cursor.isSame(day, 'day') ? 0 : -1}
      data-testid="week-picker-day"
      aria-label={day.format(format)}
      data-active={isActive}
      data-curr-month={isCurrentMonth}
      data-today={isToday}
      data-value={day.format(format)}
      key={day.toISOString()}
      className={styles.dayCell}
      onClick={() => onClick(day)}
    >
      <div className={styles.dayCellWeek}>
        {dense ? label.slice(0, 1) : label}
      </div>
      <div className={styles.dayCellDate}>{day.format('D')}</div>
    </button>
  );
};
