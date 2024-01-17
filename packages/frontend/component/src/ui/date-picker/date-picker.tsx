import {
  ArrowDownSmallIcon,
  ArrowLeftSmallIcon,
  ArrowRightSmallIcon,
} from '@blocksuite/icons';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { type HTMLAttributes, useCallback, useState } from 'react';
import DatePicker, { type ReactDatePickerProps } from 'react-datepicker';

import * as styles from './index.css';
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export interface AFFiNEDatePickerProps
  extends Omit<ReactDatePickerProps, 'onChange'> {
  value?: string;
  onChange: (value: string) => void;
}

interface HeaderLayoutProps extends HTMLAttributes<HTMLDivElement> {
  length: number;
  left: React.ReactNode;
  right: React.ReactNode;
}

/**
 * The `DatePicker` should work with different width
 * This is a hack to make header's item align with calendar cell's label, **instead of the cell**
 * @param length: number of items that calendar body row has
 */
const HeaderLayout = ({
  length,
  left,
  right,
  className,
  ...attrs
}: HeaderLayoutProps) => {
  return (
    <div className={clsx(styles.row, className)} {...attrs}>
      {Array.from({ length })
        .fill(0)
        .map((_, index) => {
          const isLeft = index === 0;
          const isRight = index === length - 1;
          return (
            <div
              key={index}
              data-is-left={isLeft}
              data-is-right={isRight}
              className={styles.headerLayoutCell}
            >
              <div className={styles.headerLayoutCellOrigin}>
                {isLeft ? left : isRight ? right : null}
              </div>
            </div>
          );
        })}
    </div>
  );
};

export const AFFiNEDatePicker = ({
  value,
  onChange,
  ...props
}: AFFiNEDatePickerProps) => {
  const [openMonthPicker, setOpenMonthPicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    value ? dayjs(value).toDate() : null
  );
  const handleOpenMonthPicker = useCallback(() => {
    setOpenMonthPicker(true);
  }, []);
  const handleCloseMonthPicker = useCallback(() => {
    setOpenMonthPicker(false);
  }, []);
  const handleSelectDate = (date: Date | null) => {
    if (date) {
      setSelectedDate(date);
      onChange(dayjs(date).format('YYYY-MM-DD'));
      setOpenMonthPicker(false);
    }
  };
  const renderCustomHeader = ({
    date,
    decreaseMonth,
    increaseMonth,
    prevMonthButtonDisabled,
    nextMonthButtonDisabled,
  }: {
    date: Date;
    decreaseMonth: () => void;
    increaseMonth: () => void;
    prevMonthButtonDisabled: boolean;
    nextMonthButtonDisabled: boolean;
  }) => {
    const selectedYear = dayjs(date).year();
    const selectedMonth = dayjs(date).month();
    return (
      <HeaderLayout
        length={7}
        className={styles.headerStyle}
        left={
          <div className={styles.headerLabel}>
            <div
              data-testid="date-picker-current-month"
              className={styles.mouthStyle}
            >
              {months[selectedMonth]}
            </div>
            <div
              data-testid="date-picker-current-year"
              className={styles.yearStyle}
            >
              {selectedYear}
            </div>
            <div
              data-testid="month-picker-button"
              className={styles.arrowDownStyle}
              onClick={handleOpenMonthPicker}
            >
              <ArrowDownSmallIcon />
            </div>
          </div>
        }
        right={
          <div className={styles.headerActionWrapper}>
            <button
              data-testid="date-picker-prev-button"
              className={styles.headerAction}
              onClick={decreaseMonth}
              disabled={prevMonthButtonDisabled}
            >
              <ArrowLeftSmallIcon />
            </button>
            <button
              data-testid="date-picker-next-button"
              className={styles.headerAction}
              onClick={increaseMonth}
              disabled={nextMonthButtonDisabled}
            >
              <ArrowRightSmallIcon />
            </button>
          </div>
        }
      />
    );
  };
  const renderCustomMonthHeader = ({
    date,
    decreaseYear,
    increaseYear,
    prevYearButtonDisabled,
    nextYearButtonDisabled,
  }: {
    date: Date;
    decreaseYear: () => void;
    increaseYear: () => void;
    prevYearButtonDisabled: boolean;
    nextYearButtonDisabled: boolean;
  }) => {
    const selectedYear = dayjs(date).year();
    return (
      <HeaderLayout
        length={3}
        className={styles.monthHeaderStyle}
        left={
          <div
            data-testid="month-picker-current-year"
            className={styles.monthTitleStyle}
          >
            {selectedYear}
          </div>
        }
        right={
          <div className={styles.headerActionWrapper}>
            <button
              data-testid="month-picker-prev-button"
              className={styles.headerAction}
              onClick={decreaseYear}
              disabled={prevYearButtonDisabled}
            >
              <ArrowLeftSmallIcon />
            </button>
            <button
              data-testid="month-picker-next-button"
              className={styles.headerAction}
              onClick={increaseYear}
              disabled={nextYearButtonDisabled}
            >
              <ArrowRightSmallIcon />
            </button>
          </div>
        }
      />
    );
  };
  return (
    <DatePicker
      onClickOutside={handleCloseMonthPicker}
      className={styles.inputStyle}
      calendarClassName={styles.calendarStyle}
      weekDayClassName={() => styles.weekStyle}
      dayClassName={() => styles.dayStyle}
      popperClassName={styles.popperStyle}
      monthClassName={() => styles.mouthsStyle}
      selected={selectedDate}
      onChange={handleSelectDate}
      showPopperArrow={false}
      dateFormat="MMM dd"
      showMonthYearPicker={openMonthPicker}
      shouldCloseOnSelect={!openMonthPicker}
      renderCustomHeader={({
        date,
        decreaseYear,
        increaseYear,
        decreaseMonth,
        increaseMonth,
        prevYearButtonDisabled,
        nextYearButtonDisabled,
        prevMonthButtonDisabled,
        nextMonthButtonDisabled,
      }) =>
        openMonthPicker
          ? renderCustomMonthHeader({
              date,
              decreaseYear,
              increaseYear,
              prevYearButtonDisabled,
              nextYearButtonDisabled,
            })
          : renderCustomHeader({
              date,
              decreaseMonth,
              increaseMonth,
              prevMonthButtonDisabled,
              nextMonthButtonDisabled,
            })
      }
      {...props}
    />
  );
};

export default AFFiNEDatePicker;
