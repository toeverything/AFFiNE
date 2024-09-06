import clsx from 'clsx';
import dayjs from 'dayjs';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';

import * as styles from './calendar.css';
import { DATE_MAX, DATE_MIN } from './constants';
import { CalendarLayout, DefaultDateCell, NavButtons } from './items';
import type { DateCell, DatePickerModePanelProps } from './types';

export const DayPicker = memo(function DayPicker(
  props: DatePickerModePanelProps
) {
  const dayPickerRootRef = useRef<HTMLDivElement>(null);
  const headerMonthRef = useRef<HTMLButtonElement>(null);

  const {
    value,
    cursor,
    weekDays,
    monthNames,
    format,
    todayLabel,
    customDayRenderer,
    onChange,
    onCursorChange,
    onModeChange,
    monthHeaderCellClassName,
    monthBodyCellClassName,
  } = props;

  const matrix = useMemo(() => {
    const firstDayOfMonth = cursor.startOf('month');
    const firstDayOfFirstWeek = firstDayOfMonth.startOf('week');

    const lastDayOfMonth = cursor.endOf('month');
    const lastDayOfLastWeek = lastDayOfMonth.endOf('week');

    const matrix = [];
    let currentDay = firstDayOfFirstWeek;
    while (currentDay.isBefore(lastDayOfLastWeek)) {
      const week: DateCell[] = [];
      for (let i = 0; i < 7; i++) {
        week.push({
          date: currentDay,
          label: currentDay.date().toString(),
          isToday: currentDay.isSame(dayjs(), 'day'),
          notCurrentMonth: !currentDay.isSame(cursor, 'month'),
          selected: value ? currentDay.isSame(value, 'day') : false,
          focused: currentDay.isSame(cursor, 'day'),
        });
        currentDay = currentDay.add(1, 'day');
      }
      matrix.push(week);
    }
    return matrix;
  }, [cursor, value]);

  const prevDisabled = useMemo(() => {
    const firstDayOfMonth = cursor.startOf('month');
    return firstDayOfMonth.isSame(DATE_MIN, 'day');
  }, [cursor]);
  const nextDisabled = useMemo(() => {
    const lastDayOfMonth = cursor.endOf('month');
    return lastDayOfMonth.isSame(DATE_MAX, 'day');
  }, [cursor]);

  const onNextMonth = useCallback(() => {
    onCursorChange?.(cursor.add(1, 'month').set('date', 1));
  }, [cursor, onCursorChange]);
  const onPrevMonth = useCallback(() => {
    onCursorChange?.(cursor.add(-1, 'month').set('date', 1));
  }, [cursor, onCursorChange]);

  const focusCursor = useCallback(() => {
    const div = dayPickerRootRef.current;
    if (!div) return;
    const focused = div.querySelector('[data-is-date-cell][tabindex="0"]');
    focused && (focused as HTMLElement).focus();
  }, []);
  const openMonthPicker = useCallback(
    () => onModeChange?.('month'),
    [onModeChange]
  );
  const openYearPicker = useCallback(
    () => onModeChange?.('year'),
    [onModeChange]
  );

  // keyboard navigation
  useEffect(() => {
    const div = dayPickerRootRef.current;
    if (!div) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key))
        return;

      const focused = document.activeElement;

      // check if focused is a date cell
      if (!focused?.hasAttribute('data-is-date-cell')) return;
      if (e.shiftKey) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'ArrowUp') onCursorChange?.(cursor.add(-7, 'day'));
      if (e.key === 'ArrowDown') onCursorChange?.(cursor.add(7, 'day'));
      if (e.key === 'ArrowLeft') onCursorChange?.(cursor.add(-1, 'day'));
      if (e.key === 'ArrowRight') onCursorChange?.(cursor.add(1, 'day'));
      setTimeout(focusCursor);
    };
    div.addEventListener('keydown', onKeyDown);
    return () => {
      div?.removeEventListener('keydown', onKeyDown);
    };
  }, [cursor, focusCursor, onCursorChange]);

  const HeaderLeft = useMemo(
    () => (
      <div style={{ whiteSpace: 'nowrap' }}>
        <button
          onClick={openMonthPicker}
          ref={headerMonthRef}
          className={styles.calendarHeaderTriggerButton}
          data-testid="month-picker-button"
          data-month={cursor.month()}
          data-year={cursor.year()}
        >
          {monthNames.split(',')[cursor.month()]}
        </button>
        <button
          className={styles.calendarHeaderTriggerButton}
          onClick={openYearPicker}
          data-testid="year-picker-button"
          data-year={cursor.year()}
        >
          {cursor.year()}
        </button>
      </div>
    ),
    [cursor, monthNames, openMonthPicker, openYearPicker]
  );
  const HeaderRight = useMemo(
    () => (
      <NavButtons
        key="nav-buttons"
        onNext={onNextMonth}
        onPrev={onPrevMonth}
        prevDisabled={prevDisabled}
        nextDisabled={nextDisabled}
      >
        <button
          className={styles.headerNavToday}
          onClick={() => onChange?.(dayjs().format(format))}
        >
          {todayLabel}
        </button>
      </NavButtons>
    ),
    [
      format,
      nextDisabled,
      onChange,
      onNextMonth,
      onPrevMonth,
      prevDisabled,
      todayLabel,
    ]
  );
  const Body = useMemo(
    () => (
      <main className={styles.monthViewBody}>
        {/* weekDays */}
        <div className={styles.monthViewRow}>
          {weekDays.split(',').map(day => (
            <div
              key={day}
              className={clsx(
                styles.monthViewHeaderCell,
                monthHeaderCellClassName
              )}
            >
              {day}
            </div>
          ))}
        </div>
        {/* Weeks in month */}
        {matrix.map((week, i) => {
          return (
            <div key={i} className={clsx(styles.monthViewRow)}>
              {week.map((cell, j) => (
                <div
                  className={clsx(
                    styles.monthViewBodyCell,
                    monthBodyCellClassName
                  )}
                  key={j}
                  onClick={() => onChange?.(cell.date.format(format))}
                >
                  {customDayRenderer ? (
                    customDayRenderer(cell)
                  ) : (
                    <DefaultDateCell key={j} {...cell} />
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </main>
    ),
    [
      customDayRenderer,
      format,
      matrix,
      monthBodyCellClassName,
      monthHeaderCellClassName,
      onChange,
      weekDays,
    ]
  );

  return (
    <CalendarLayout
      mode="day"
      ref={dayPickerRootRef}
      length={7}
      headerLeft={HeaderLeft}
      headerRight={HeaderRight}
      body={Body}
    />
  );
});
