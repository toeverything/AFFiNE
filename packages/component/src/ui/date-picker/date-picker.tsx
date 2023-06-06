import {
  ArrowDownSmallIcon,
  ArrowLeftSmallIcon,
  ArrowRightSmallIcon,
} from '@blocksuite/icons';
import dayjs from 'dayjs';
import { useState } from 'react';
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
        <div className={styles.mouthStyle}>{months[selectedMonth]}</div>
        <div className={styles.yearStyle}>{selectedYear}</div>
        <div
          className={styles.arrowDownStyle}
          onClick={() => setOpenMonthPicker(true)}
        >
          <ArrowDownSmallIcon />
        </div>
        <button
          className={styles.arrowLeftStyle}
          onClick={decreaseMonth}
          disabled={prevMonthButtonDisabled}
        >
          <ArrowLeftSmallIcon />
        </button>
        <button
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
        <div className={styles.monthTitleStyle}>{selectedYear}</div>
        <button
          className={styles.arrowLeftStyle}
          onClick={decreaseYear}
          disabled={prevYearButtonDisabled}
        >
          <ArrowLeftSmallIcon />
        </button>
        <button
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
