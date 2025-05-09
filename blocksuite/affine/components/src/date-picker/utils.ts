export type MaybeDate = Date | string | number | undefined;

/**
 * @deprecated should not use raw string to represent timestamp
 * @param str
 * @returns
 */
function _isTimestampString(str: string) {
  return /^\d+$/.test(str);
}

/**
 * Parse the given date to Date object
 * @param date
 * @returns
 */
export function toDate(date?: MaybeDate) {
  // TODO: handle invalid date
  if (date instanceof Date) return date;
  if (typeof date === 'string' && _isTimestampString(date)) date = +date;
  return date ? new Date(date) : new Date();
}

/**
 * get the first day of the month of the given date
 * @param maybeDate
 */
export function getFirstDayOfMonth(maybeDate: MaybeDate) {
  const date = toDate(maybeDate);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * get the last day of the month of the given date
 * @param maybeDate
 * @example
 * getLastDayOfMonth('2021-01-01') // 2021-01-31
 */
export function getLastDayOfMonth(maybeDate: MaybeDate) {
  const date = toDate(maybeDate);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function getMonthMatrix(maybeDate: MaybeDate) {
  const date = toDate(maybeDate);
  const firstDayOfMonth = getFirstDayOfMonth(date);
  const lastDayOfMonth = getLastDayOfMonth(date);
  const firstDayOfFirstWeek = new Date(firstDayOfMonth);
  firstDayOfFirstWeek.setDate(
    firstDayOfMonth.getDate() - firstDayOfMonth.getDay()
  );
  const lastDayOfLastWeek = new Date(lastDayOfMonth);
  lastDayOfLastWeek.setDate(
    lastDayOfMonth.getDate() + (6 - lastDayOfMonth.getDay())
  );
  const matrix = [];
  let week = [];
  const day = new Date(firstDayOfFirstWeek);
  while (day <= lastDayOfLastWeek) {
    week.push(new Date(day));
    if (week.length === 7) {
      matrix.push(week);
      week = [];
    }
    day.setDate(day.getDate() + 1);
  }
  return matrix;
}
