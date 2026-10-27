import { fuzzyMatch } from '@affine/core/utils/fuzzy-match';
import { I18n } from '@affine/i18n';
import dayjs from 'dayjs';

import { JOURNAL_DATE_FORMAT } from './services/journal';

// todo: infer locale from user's locale?
const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
    new Date(2024, index)
  )
);

// todo: infer locale from user's locale?
const weekDayNames = Array.from({ length: 7 }, (_, index) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(
    new Date(2024, 0, index)
  )
);

export function suggestJournalDate(query: string): {
  dateString: string;
  alias?: string;
} | null {
  // given a query string, suggest a journal date
  // if the query is empty or, starts with "t" AND matches today
  //   -> suggest today's date
  // if the query starts with "y" AND matches "yesterday"
  //   -> suggest yesterday's date
  // if the query starts with "l" AND matches last
  //   -> suggest last week's date
  // if the query starts with "n" AND matches "next"
  //   -> suggest next week's date
  // if the query starts with the first letter of a month and matches the month name
  //   -> if the trailing part matches a number
  //      -> suggest the date of the month
  //      -> otherwise, suggest the current day of the month
  // otherwise, return null
  query = query.trim().toLowerCase().split(' ').join('');

  if (query === '' || fuzzyMatch('today', query, true)) {
    return {
      dateString: dayjs().format(JOURNAL_DATE_FORMAT),
      alias: I18n.t('com.affine.today'),
    };
  }

  if (fuzzyMatch('tomorrow', query, true)) {
    return {
      dateString: dayjs().add(1, 'day').format(JOURNAL_DATE_FORMAT),
      alias: I18n.t('com.affine.tomorrow'),
    };
  }

  if (fuzzyMatch('yesterday', query, true)) {
    return {
      dateString: dayjs().subtract(1, 'day').format(JOURNAL_DATE_FORMAT),
      alias: I18n.t('com.affine.yesterday'),
    };
  }

  // next week dates, start from monday
  const nextWeekDates = Array.from({ length: 7 }, (_, index) =>
    dayjs()
      .add(1, 'week')
      .startOf('week')
      .add(index, 'day')
      .format(JOURNAL_DATE_FORMAT)
  ).map(date => ({
    dateString: date,
    alias: I18n.t('com.affine.next-week', {
      weekday: weekDayNames[dayjs(date).day()],
    }),
  }));

  const lastWeekDates = Array.from({ length: 7 }, (_, index) =>
    dayjs()
      .subtract(1, 'week')
      .startOf('week')
      .add(index, 'day')
      .format(JOURNAL_DATE_FORMAT)
  ).map(date => ({
    dateString: date,
    alias: I18n.t('com.affine.last-week', {
      weekday: weekDayNames[dayjs(date).day()],
    }),
  }));

  for (const date of [...nextWeekDates, ...lastWeekDates]) {
    const matched = fuzzyMatch(date.alias, query, true);
    if (matched) {
      return date;
    }
  }

  // if query is a string that starts with alphabet letters and/or numbers
  const regex = new RegExp(`^([a-z]+)(\\d*)$`, 'i');
  const matched = query.match(regex);

  if (matched) {
    const [_, letters, numbers] = matched;
    const now = dayjs();

    for (const [monthIndex, month] of monthNames.entries()) {
      const monthMatched = fuzzyMatch(month, letters, true);
      if (monthMatched) {
        const targetMonth = now.month(monthIndex);
        const daysInMonth = targetMonth.daysInMonth();
        const fallbackDay = Math.min(now.date(), daysInMonth);
        const parsedDay = numbers ? parseInt(numbers) : fallbackDay;
        const day =
          parsedDay < 1 || parsedDay > daysInMonth ? fallbackDay : parsedDay;
        return {
          dateString: targetMonth.date(day).format(JOURNAL_DATE_FORMAT),
        };
      }
    }
  }

  return null;
}
