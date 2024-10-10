import dayjs from 'dayjs';

import { I18n } from '../i18next';

export type TimeUnit =
  | 'second'
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'year';

const timeUnitCode = {
  second: 1,
  minute: 2,
  hour: 3,
  day: 4,
  week: 5,
  month: 6,
  year: 7,
} satisfies Record<TimeUnit, number>;

/**
 * ```ts
 * // timestamp to string
 * i18nTime(1728538228000) -> 'Oct 10, 2024, 1:30:28 PM'
 *
 * // absolute time string
 * i18nTime('2024-10-10 13:30:28', { absolute: { accuracy: 'minute' } }) -> '2024-10-10 13:30 PM'
 * i18nTime('2024-10-10 13:30:28', { absolute: { accuracy: 'minute', noDate: true } }) -> '13:30 PM'
 * i18nTime('2024-10-10 13:30:28', { absolute: { accuracy: 'minute', noYear: true } }) -> 'Oct 10, 13:30 PM'
 * i18nTime('2024-10-10 13:30:28', { absolute: { accuracy: 'day' } }) -> 'Oct 10, 2024'
 *
 * // relative time string
 * i18nTime('2024-10-10 13:30:30', { relative: true }) -> 'now'
 * i18nTime('2024-10-10 13:30:00', { relative: true }) -> '30s ago'
 * i18nTime('2024-10-10 13:30:30', { relative: { accuracy: 'minute' } }) -> '2m ago'
 *
 * // show absolute time string if time is pass 1 day
 * i18nTime('2024-10-9 14:30:30', { relative: { max: [1, 'day'] } }) -> '23h ago'
 * i18nTime('2024-10-9 13:30:30', { relative: { max: [1, 'day'] } }) -> 'Oct 9, 2024, 1:30:30 PM'
 * ```
 */
export function i18nTime(
  time: dayjs.ConfigType,
  options: {
    // override i18n instance, default is global I18n instance
    i18n?: I18n;
    // override now time, default is current time
    now?: dayjs.ConfigType;
    relative?:
      | {
          // max time to show relative time, if time is pass this time, show absolute time
          max?: [number, TimeUnit];
          // show time with this accuracy
          accuracy?: TimeUnit;
          // show weekday, e.g. 'Monday', 'Tuesday', etc.
          weekday?: boolean;
          // show 'yesterday' or 'tomorrow' if time is
          yesterdayAndTomorrow?: boolean;
        }
      | true; // use default relative option
    absolute?: {
      // show time with this accuracy
      accuracy?: TimeUnit;
      // hide year
      noYear?: boolean;
      // hide date (year, month, day)
      noDate?: boolean;
    };
  } = {}
) {
  const i18n = options.i18n ?? I18n;
  time = dayjs(time);
  if (!time.isValid()) {
    return ''; // invalid time, return empty string
  }

  const now = dayjs(options.now);

  const defaultRelativeOption = {
    max: [1000, 'year'],
    accuracy: 'second',
    weekday: false,
    yesterdayAndTomorrow: true,
  } satisfies typeof options.relative;

  const relativeOption = options.relative
    ? options.relative === true
      ? defaultRelativeOption
      : {
          ...defaultRelativeOption,
          ...options.relative,
        }
    : null;

  const defaultAbsoluteOption = {
    accuracy: 'second',
    noYear: false,
    noDate: false,
  } satisfies typeof options.absolute;

  const absoluteOption = {
    ...defaultAbsoluteOption,
    ...options.absolute,
  };

  if (relativeOption) {
    // show relative

    const formatter = new Intl.RelativeTimeFormat(i18n.language, {
      style: 'narrow',
      numeric: relativeOption.yesterdayAndTomorrow ? 'auto' : 'always',
    });

    const timeUnitProcessor = {
      second: () => {
        const diffSecond = time.diff(now) / 1000;
        if (Math.abs(diffSecond) < 1) {
          return i18n['com.affine.time.now']();
        }
        if (
          relativeOption.max[1] === 'second' &&
          Math.abs(diffSecond) >= relativeOption.max[0]
        ) {
          return false;
        }
        if (Math.abs(diffSecond) < 60) {
          return formatter.format(Math.trunc(diffSecond), 'second');
        }
        return null;
      },
      minute: () => {
        const diffMinute = time.diff(now) / 1000 / 60;
        if (Math.abs(diffMinute) < 1) {
          return i18n['com.affine.time.now']();
        }
        if (
          relativeOption.max[1] === 'minute' &&
          Math.abs(diffMinute) >= relativeOption.max[0]
        ) {
          return false;
        }
        if (Math.abs(diffMinute) < 60) {
          return formatter.format(Math.trunc(diffMinute), 'minute');
        }
        return null;
      },
      hour: () => {
        const diffHour = time.diff(now) / 1000 / 60 / 60;
        if (Math.abs(diffHour) < 1) {
          return i18n['com.affine.time.now']();
        }
        if (
          relativeOption.max[1] === 'hour' &&
          Math.abs(diffHour) >= relativeOption.max[0]
        ) {
          return false;
        }
        if (Math.abs(diffHour) < 24) {
          return formatter.format(Math.trunc(diffHour), 'hour');
        }
        return null;
      },
      day: () => {
        const diffDay = time.startOf('day').diff(now.startOf('day'), 'day');
        if (Math.abs(diffDay) < 1) {
          return i18n['com.affine.time.today']();
        }
        if (
          relativeOption.max[1] === 'day' &&
          Math.abs(diffDay) >= relativeOption.max[0]
        ) {
          return false;
        }
        if (relativeOption.yesterdayAndTomorrow && Math.abs(diffDay) < 2) {
          return formatter.format(Math.trunc(diffDay), 'day');
        } else if (relativeOption.weekday && Math.abs(diffDay) < 7) {
          return new Intl.DateTimeFormat(i18n.language, {
            weekday: 'long',
          }).format(time.startOf('day').toDate());
        } else if (Math.abs(diffDay) < 7) {
          return formatter.format(Math.trunc(diffDay), 'day');
        }
        return null;
      },
      week: () => {
        const inSameMonth = time.startOf('month').isSame(now.startOf('month'));
        const diffWeek = time.startOf('week').diff(now.startOf('week'), 'week');
        if (Math.abs(diffWeek) < 1) {
          return i18n['com.affine.time.this-week']();
        }
        if (
          relativeOption.max[1] === 'week' &&
          Math.abs(diffWeek) >= relativeOption.max[0]
        ) {
          return false;
        }
        if (inSameMonth || Math.abs(diffWeek) < 3) {
          return formatter.format(Math.trunc(diffWeek), 'week');
        }
        return null;
      },
      month: () => {
        const diffMonth = time
          .startOf('month')
          .diff(now.startOf('month'), 'month');
        if (Math.abs(diffMonth) < 1) {
          return i18n['com.affine.time.this-mouth']();
        }
        if (
          relativeOption.max[1] === 'month' &&
          Math.abs(diffMonth) >= relativeOption.max[0]
        ) {
          return false;
        }
        if (Math.abs(diffMonth) < 12) {
          return formatter.format(Math.trunc(diffMonth), 'month');
        }
        return null;
      },
      year: () => {
        const diffYear = time.startOf('year').diff(now.startOf('year'), 'year');
        if (Math.abs(diffYear) < 1) {
          return i18n['com.affine.time.this-year']();
        }
        if (
          relativeOption.max[1] === 'year' &&
          Math.abs(diffYear) >= relativeOption.max[0]
        ) {
          return false;
        }
        return formatter.format(Math.trunc(diffYear), 'year');
      },
    } as Record<TimeUnit, () => string | false | null>;

    const processors = Object.entries(timeUnitProcessor).sort(
      (a, b) => timeUnitCode[a[0] as TimeUnit] - timeUnitCode[b[0] as TimeUnit]
    ) as [TimeUnit, () => string | false | null][];

    for (const [unit, processor] of processors) {
      if (timeUnitCode[relativeOption.accuracy] > timeUnitCode[unit]) {
        continue;
      }
      const result = processor();
      if (result) {
        return result;
      }
      if (result === false) {
        break;
      }
    }
  }

  // show absolute
  const formatter = new Intl.DateTimeFormat(i18n.language, {
    year:
      !absoluteOption.noYear && !absoluteOption.noDate ? 'numeric' : undefined,
    month:
      !absoluteOption.noDate &&
      timeUnitCode[absoluteOption.accuracy] <= timeUnitCode['month']
        ? 'short'
        : undefined,
    day:
      !absoluteOption.noDate &&
      timeUnitCode[absoluteOption.accuracy] <= timeUnitCode['day']
        ? 'numeric'
        : undefined,
    hour:
      timeUnitCode[absoluteOption.accuracy] <= timeUnitCode['hour']
        ? 'numeric'
        : undefined,
    minute:
      timeUnitCode[absoluteOption.accuracy] <= timeUnitCode['minute']
        ? 'numeric'
        : undefined,
    second:
      timeUnitCode[absoluteOption.accuracy] <= timeUnitCode['second']
        ? 'numeric'
        : undefined,
  });

  return formatter.format(time.toDate());
}
