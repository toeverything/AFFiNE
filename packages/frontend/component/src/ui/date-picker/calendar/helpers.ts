import type dayjs from 'dayjs';

export function isSameDay(a: dayjs.Dayjs, b: dayjs.Dayjs) {
  return a.isValid() && b.isValid() && a.isSame(b, 'day');
}

export function isSameMonth(a: dayjs.Dayjs, b: dayjs.Dayjs) {
  return a.isValid() && b.isValid() && a.isSame(b, 'month');
}
