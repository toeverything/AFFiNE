import type dayjs from 'dayjs';
import type { ReactNode } from 'react';

export interface DatePickerProps {
  /**
   * selected date value, format is defined by `format` prop
   */
  value?: string;

  /**
   * @default 'YYYY-MM-DD'
   */
  format?: string;

  /**
   * Customize the vertical gap between each row, in `px`
   * @default 8
   */
  gapY?: number;

  /**
   * Customize the horizontal gap between each column, in `px`
   * Attention: for responsive layout, this will only affect the minimum gap, the actual gap will be calculated based on the available space
   * @default 8
   */
  gapX?: number;

  /**
   * Customize weekdays, use `,` to separate each day
   * @default {} `'Su,Mo,Tu,We,Th,Fr,Sa'`
   **/
  weekDays?: string;

  /**
   * Customize month names
   */
  monthNames?: string;

  /**
   * Customize today label
   */
  todayLabel?: string;

  /**
   * Customize rendering of day cell
   */
  customDayRenderer?: (cell: DateCell) => ReactNode;

  /**
   * when date is clicked
   */
  onChange?: (value: string) => void;

  // style customizations
  monthHeaderCellClassName?: string;
  monthBodyCellClassName?: string;
}

/**
 * Date for a cell in the calendar
 */
export interface DateCell {
  date: dayjs.Dayjs;
  label: string;
  isToday: boolean;
  notCurrentMonth: boolean;
  selected?: boolean;
  focused?: boolean;
}

export type SelectMode = 'day' | 'month' | 'year';

export const defaultDatePickerProps = {
  format: 'YYYY-MM-DD',
  gapX: 8,
  gapY: 8,
  weekDays: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].join(','),
  monthNames: [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ].join(','),
  todayLabel: 'Today',
} satisfies Partial<DatePickerProps>;
export type DefaultDatePickerProps = typeof defaultDatePickerProps;

export interface DatePickerModePanelProps
  extends DefaultDatePickerProps,
    Omit<DatePickerProps, keyof DefaultDatePickerProps> {
  cursor: dayjs.Dayjs;
  onCursorChange?: (cursor: dayjs.Dayjs) => void;
  onModeChange?: (mode: SelectMode) => void;
}
