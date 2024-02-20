import dayjs from 'dayjs';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import * as styles from './calendar.css';
import { DATE_MAX, DATE_MIN } from './constants';
import { CalendarLayout, NavButtons } from './items';
import type { DatePickerModePanelProps } from './types';

const ROW_SIZE = 3;

export const MonthPicker = memo(function MonthPicker(
  props: DatePickerModePanelProps
) {
  const { cursor, value, monthNames, onModeChange, onCursorChange } = props;
  const dayPickerRootRef = useRef<HTMLDivElement>(null);

  const [monthCursor, setMonthCursor] = useState(cursor.startOf('month'));

  const closeMonthPicker = useCallback(
    () => onModeChange?.('day'),
    [onModeChange]
  );

  const onMonthChange = useCallback(
    (m: dayjs.Dayjs) => {
      onModeChange?.('day');
      onCursorChange?.(m);
    },
    [onCursorChange, onModeChange]
  );

  const nextYear = useCallback(
    () => setMonthCursor(prev => prev.add(1, 'year').startOf('year')),
    []
  );
  const prevYear = useCallback(
    () => setMonthCursor(prev => prev.subtract(1, 'year').startOf('year')),
    []
  );
  const nextYearDisabled = useMemo(
    () => monthCursor.isSame(DATE_MAX, 'year'),
    [monthCursor]
  );
  const prevYearDisabled = useMemo(
    () => monthCursor.isSame(DATE_MIN, 'year'),
    [monthCursor]
  );
  const matrix = useMemo(() => {
    const matrix = [];
    let currentMonth = monthCursor.startOf('year');
    while (currentMonth.isBefore(monthCursor.endOf('year'))) {
      const month: DatePickerModePanelProps['cursor'][] = [];
      for (let i = 0; i < ROW_SIZE; i++) {
        month.push(currentMonth.clone());
        currentMonth = currentMonth.add(1, 'month');
      }
      matrix.push(month);
    }
    return matrix;
  }, [monthCursor]);

  const focusCursor = useCallback(() => {
    const div = dayPickerRootRef.current;
    if (!div) return;
    const focused = div.querySelector('[data-is-month-cell][tabindex="0"]');
    focused && (focused as HTMLElement).focus();
  }, []);

  // keyboard navigation
  useEffect(() => {
    const div = dayPickerRootRef.current;
    if (!div) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeMonthPicker();
        return;
      }

      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key))
        return;

      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'ArrowUp')
        setMonthCursor(c => c.subtract(ROW_SIZE, 'month'));
      if (e.key === 'ArrowDown') setMonthCursor(c => c.add(ROW_SIZE, 'month'));
      if (e.key === 'ArrowLeft') setMonthCursor(c => c.subtract(1, 'month'));
      if (e.key === 'ArrowRight') setMonthCursor(c => c.add(1, 'month'));
      setTimeout(focusCursor);
    };

    div.addEventListener('keydown', onKeyDown);

    return () => {
      div.removeEventListener('keydown', onKeyDown);
    };
  }, [closeMonthPicker, focusCursor]);

  const HeaderLeft = useMemo(() => {
    return (
      <button
        data-testid="month-picker-current-year"
        onClick={closeMonthPicker}
        className={styles.calendarHeaderTriggerButton}
      >
        {monthCursor.format('YYYY')}
      </button>
    );
  }, [closeMonthPicker, monthCursor]);

  const HeaderRight = useMemo(() => {
    return (
      <NavButtons
        onNext={nextYear}
        onPrev={prevYear}
        prevDisabled={prevYearDisabled}
        nextDisabled={nextYearDisabled}
      />
    );
  }, [nextYear, nextYearDisabled, prevYear, prevYearDisabled]);

  const Body = useMemo(() => {
    return (
      <div className={styles.yearViewBody}>
        {matrix.map((row, i) => {
          return (
            <div key={i} className={styles.yearViewRow}>
              {row.map((month, j) => {
                return (
                  <div key={j} className={styles.yearViewBodyCell}>
                    <button
                      data-value={month.format('YYYY-MM')}
                      data-is-month-cell
                      className={styles.yearViewBodyCellInner}
                      data-selected={value && month.isSame(value, 'month')}
                      data-current-month={month.isSame(dayjs(), 'month')}
                      onClick={() => onMonthChange(month)}
                      tabIndex={month.isSame(monthCursor, 'month') ? 0 : -1}
                      aria-label={month.format('YYYY-MM')}
                    >
                      {monthNames.split(',')[month.month()]}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }, [matrix, monthCursor, monthNames, onMonthChange, value]);

  return (
    <CalendarLayout
      mode="month"
      ref={dayPickerRootRef}
      length={3}
      headerLeft={HeaderLeft}
      headerRight={HeaderRight}
      body={Body}
    />
  );
});
