import {
  ArrowDownSmallIcon,
  ArrowLeftSmallIcon,
  ArrowRightSmallIcon,
} from '@blocksuite/icons';
import dayjs from 'dayjs';
import { useCallback, useState } from 'react';
import DatePicker from 'react-datepicker';

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
type DatePickerProps = {
  value?: string;
  onChange: (value: string) => void;
};

export const AFFiNEDatePicker = (props: DatePickerProps) => {
  const { value, onChange } = props;
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
      <div className={styles.headerStyle}>
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
        <button
          data-testid="date-picker-prev-button"
          className={styles.arrowLeftStyle}
          onClick={decreaseMonth}
          disabled={prevMonthButtonDisabled}
        >
          <ArrowLeftSmallIcon />
        </button>
        <button
          data-testid="date-picker-next-button"
          className={styles.arrowRightStyle}
          onClick={increaseMonth}
          disabled={nextMonthButtonDisabled}
        >
          <ArrowRightSmallIcon />
        </button>
      </div>
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
      <div className={styles.monthHeaderStyle}>
        <div
          data-testid="month-picker-current-year"
          className={styles.monthTitleStyle}
        >
          {selectedYear}
        </div>
        <button
          data-testid="month-picker-prev-button"
          className={styles.arrowLeftStyle}
          onClick={decreaseYear}
          disabled={prevYearButtonDisabled}
        >
          <ArrowLeftSmallIcon />
        </button>
        <button
          data-testid="month-picker-next-button"
          className={styles.arrowRightStyle}
          onClick={increaseYear}
          disabled={nextYearButtonDisabled}
        >
          <ArrowRightSmallIcon />
        </button>
      </div>
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
    />
  );
};

export default AFFiNEDatePicker;
