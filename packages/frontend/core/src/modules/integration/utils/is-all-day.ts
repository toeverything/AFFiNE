import type { Dayjs } from 'dayjs';

export const isAllDay = (current: Dayjs, start: Dayjs, end: Dayjs): boolean => {
  if (current.isSame(start, 'day')) {
    return (
      start.hour() === 0 && start.minute() === 0 && !current.isSame(end, 'day')
    );
  } else if (current.isSame(end, 'day')) {
    return false;
  } else {
    return true;
  }
};
