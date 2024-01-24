import { ArrowLeftSmallIcon, ArrowRightSmallIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import dayjs from 'dayjs';
import {
  type ForwardedRef,
  type HTMLAttributes,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

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

// TODO: i18n
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
  const [range, setRange] = useState([0, 7]);
  const [dense, setDense] = useState(false);
  const [allDays, setAllDays] = useState<dayjs.Dayjs[]>([]);
  const [viewPortSize, setViewPortSize] = useState(7);

  useImperativeHandle(handleRef, () => ({
    setCursor,
  }));

  const displayDays = allDays.slice(...range);

  const updateRange = useCallback(
    (newRange: [number, number]) => {
      if (range && newRange[0] === range[0] && newRange[1] === range[1]) return;
      setRange(newRange);
    },
    [range]
  );

  const onNext = useCallback(() => {
    if (viewPortSize === 7) {
      setCursor(cursor.add(1, 'week'));
    } else if (range[1] === 7) {
      setCursor(cursor.add(1, 'week'));
      updateRange([0, viewPortSize]);
    } else {
      const end = Math.min(range[1] + viewPortSize, 7);
      const start = Math.min(range[0] + viewPortSize, end - viewPortSize);
      updateRange([start, end]);
    }
  }, [cursor, range, updateRange, viewPortSize]);
  const onPrev = useCallback(() => {
    if (viewPortSize === 7) {
      setCursor(cursor.add(-1, 'week'));
    } else if (range[0] === 0) {
      setCursor(cursor.add(-1, 'week'));
      updateRange([7 - viewPortSize, 7]);
    } else {
      const start = Math.max(range[0] - viewPortSize, 0);
      const end = Math.max(range[1] - viewPortSize, start + viewPortSize);
      updateRange([start, end]);
    }
  }, [cursor, range, updateRange, viewPortSize]);
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

    const resizeObserver = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      const width = rect.width;
      if (!width) return;

      const minWidth = 30;
      const gap = 4;
      const viewPortCount = Math.floor(width / (minWidth + gap));
      setViewPortSize(Math.max(1, Math.min(viewPortCount, 7)));
      setDense(width < 300);
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // update allDays when cursor changes
  useEffect(() => {
    const firstDay = dayjs(cursor).startOf('week');
    if (allDays[0] && firstDay.isSame(allDays[0], 'day')) return;

    setAllDays(
      Array.from({ length: 7 }).map((_, index) =>
        firstDay.add(index, 'day').startOf('day')
      )
    );
  }, [allDays, cursor]);

  // when viewPortSize changes, reset range
  useEffect(() => {
    if (viewPortSize >= 7) updateRange([0, 7]);
    else {
      const end = Math.min(7, range[0] + viewPortSize);
      const start = Math.max(0, end - viewPortSize);
      updateRange([start, end]);
    }
  }, [range, updateRange, viewPortSize]);

  // when value changes, reset cursor
  useEffect(() => {
    value && setCursor(dayjs(value));
  }, [value]);

  // TODO: keyboard navigation
  useEffect(() => {
    if (!weekRef.current) return;
    const el = weekRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();

      const focused = document.activeElement as HTMLElement;
      if (!focused) return el.querySelector('button')?.focus();
      const day = dayjs(focused.dataset.value);
      if (
        (day.day() === 0 && e.key === 'ArrowLeft') ||
        (e.key === 'ArrowLeft' && !focused.previousElementSibling)
      ) {
        onPrev();
        requestAnimationFrame(() => {
          el.querySelector('button')?.focus();
        });
      }

      if (
        (day.day() === 6 && e.key === 'ArrowRight') ||
        (e.key === 'ArrowRight' && !focused.nextElementSibling)
      ) {
        onNext();
        requestAnimationFrame(() => {
          (el.querySelector('button:last-child') as HTMLElement)?.focus();
        });
      }

      if (e.key === 'ArrowLeft' && focused.previousElementSibling) {
        (focused.previousElementSibling as HTMLElement).focus();
      }
      if (e.key === 'ArrowRight' && focused.nextElementSibling) {
        (focused.nextElementSibling as HTMLElement).focus();
      }
    };
    el.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('keydown', onKeyDown);
    };
  }, [onNext, onPrev]);

  return (
    <div className={clsx(styles.weekDatePicker, className)} {...attrs}>
      <IconButton onClick={onPrev}>
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

      <IconButton onClick={onNext}>
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
      tabIndex={0}
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
