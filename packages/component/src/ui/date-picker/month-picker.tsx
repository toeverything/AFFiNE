import {
  ArrowDownSmallIcon,
  ArrowLeftSmallIcon,
  ArrowRightSmallIcon,
} from '@blocksuite/icons';
import dayjs from 'dayjs';
import { useState } from 'react';
import DatePicker from 'react-datepicker';

import * as styles from './index.css';

type MyDatePickerProps = {
  date: Date;
  changeYear: (year: number) => void;
  changeMonth: (month: number) => void;
};

export const AFFiNEMonthPicker = (props: MyDatePickerProps) => {
  const { date, changeMonth, changeYear } = props;
  const [selectedDate, setSelectedDate] = useState<Date>(date);
  const handleSelectDate = (date: Date | null) => {
    if (date) {
      setSelectedDate(date);
      changeMonth(date.getMonth());
      changeYear(date.getFullYear());
    }
  };
  const customInput = (
    <div className={styles.arrowDownStyle}>
      <ArrowDownSmallIcon />
    </div>
  );
  const renderCustomHeader = ({
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
      popperClassName={styles.monthPopperStyle}
      monthClassName={() => styles.mouthsStyle}
      selected={selectedDate}
      onChange={handleSelectDate}
      showPopperArrow={false}
      showMonthYearPicker
      customInput={customInput}
      renderCustomHeader={({
        date,
        decreaseYear,
        increaseYear,
        prevYearButtonDisabled,
        nextYearButtonDisabled,
      }) =>
        renderCustomHeader({
          date,
          decreaseYear,
          increaseYear,
          prevYearButtonDisabled,
          nextYearButtonDisabled,
        })
      }
    />
  );
};

export default AFFiNEMonthPicker;
