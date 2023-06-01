import dayjs from 'dayjs';
import { useState } from 'react';
import DatePicker from 'react-datepicker';

const years = Array.from({ length: dayjs().year() - 1970 }, (v, i) =>
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

export const MyDatePicker = (props: MyDatePickerProps) => {
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
      <div style={{ margin: 10, display: 'flex', justifyContent: 'center' }}>
        <button onClick={decreaseMonth} disabled={prevMonthButtonDisabled}>
          {'<'}
        </button>
        <select
          value={selectedYear}
          onChange={e => changeYear(dayjs(e.target.value).year())}
        >
          {years.map(year => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <select
          value={selectedMonth}
          onChange={e => changeMonth(dayjs(e.target.value).month())}
        >
          {months.map((month, index) => (
            <option key={month} value={index}>
              {month}
            </option>
          ))}
        </select>
        <button onClick={increaseMonth} disabled={nextMonthButtonDisabled}>
          {'>'}
        </button>
      </div>
    );
  };
  return (
    <DatePicker
      className="myDatePicker"
      calendarClassName="myDatePicker"
      dayClassName={() => 'myDatePickerDay'}
      selected={selectedDate}
      onChange={handleSelectDate}
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

export default MyDatePicker;
