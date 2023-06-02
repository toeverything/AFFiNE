import { ArrowLeftSmallIcon, ArrowRightSmallIcon } from '@blocksuite/icons';
import dayjs from 'dayjs';
import { useState } from 'react';
import DatePicker from 'react-datepicker';

import * as styles from './index.css';
const years = Array.from({ length: dayjs().year() - 1969 }, (v, i) =>
  (1970 + i).toString()
);
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
type MyDatePickerProps = {
  value?: string;
  onChange: (value: string) => void;
};

export const AFFiNEDatePicker = (props: MyDatePickerProps) => {
  const { value, onChange } = props;
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    value ? dayjs(value).toDate() : null
  );

  const handleSelectDate = (date: Date | null) => {
    if (date) {
      setSelectedDate(date);
      onChange(dayjs(date).format('YYYY-MM-DD'));
    }
  };
  const renderCustomHeader = ({
    date,
    changeYear,
    changeMonth,
    decreaseMonth,
    increaseMonth,
    prevMonthButtonDisabled,
    nextMonthButtonDisabled,
  }: {
    date: Date;
    changeYear: (year: number) => void;
    changeMonth: (month: number) => void;
    decreaseMonth: () => void;
    increaseMonth: () => void;
    prevMonthButtonDisabled: boolean;
    nextMonthButtonDisabled: boolean;
  }) => {
    const selectedYear = dayjs(date).year();
    const selectedMonth = dayjs(date).month();
    return (
      <div className={styles.headerStyle}>
        <select
          value={selectedYear}
          onChange={e => changeYear(Number(e.target.value))}
        >
          {years.map(year => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <select
          value={selectedMonth}
          onChange={e => {
            changeMonth(Number(e.target.value));
          }}
        >
          {months.map((month, index) => (
            <option key={month} value={index}>
              {month}
            </option>
          ))}
        </select>
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
  return (
    <DatePicker
      className={styles.inputStyle}
      calendarClassName={styles.calendarStyle}
      weekDayClassName={() => styles.weekStyle}
      dayClassName={() => styles.dayStyle}
      popperClassName={styles.popperStyle}
      selected={selectedDate}
      onChange={handleSelectDate}
      showPopperArrow={false}
      dateFormat="yyyy-MM-dd"
      renderCustomHeader={({
        date,
        changeYear,
        changeMonth,
        decreaseMonth,
        increaseMonth,
        prevMonthButtonDisabled,
        nextMonthButtonDisabled,
      }) =>
        renderCustomHeader({
          date,
          changeYear,
          changeMonth,
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
