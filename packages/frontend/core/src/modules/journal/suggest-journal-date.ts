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

type JournalDateSuggestion = {
  dateString: string;
  alias?: string;
};

const MATCH_NONE = 0;
const MATCH_SUBSEQUENCE = 1;
const MATCH_CONTAINS = 2;
const MATCH_PREFIX = 3;

function normalizeQuery(value: string) {
  return value.trim().toLowerCase().split(' ').join('');
}

/**
 * Scores how closely an alias answers the query. A prefix beats a contiguous run,
 * a contiguous run beats a scattered subsequence, so "nextsa" reaches "next
 * saturday" instead of stopping at the s and the a inside "sunday".
 */
function matchScore(alias: string, query: string) {
  if (!fuzzyMatch(alias, query, true)) {
    return MATCH_NONE;
  }

  const index = normalizeQuery(alias).indexOf(query);
  if (index === 0) {
    return MATCH_PREFIX;
  }

  return index > 0 ? MATCH_CONTAINS : MATCH_SUBSEQUENCE;
}

/**
 * Suggests a journal date for a fuzzy query such as "next sa" or "dec 10".
 */
export function suggestJournalDate(
  query: string
): JournalDateSuggestion | null {
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
  query = normalizeQuery(query);

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

  // next week dates, sunday first (dayjs startOf week)
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

  let bestMatch: JournalDateSuggestion | null = null;
  let bestScore = MATCH_NONE;
  for (const date of [...nextWeekDates, ...lastWeekDates]) {
    const score = matchScore(date.alias, query);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = date;
    }
  }

  // month names can beat a loose weekday match: "no" is closer to "november"
  // than to the n...o inside "next monday"
  const regex = new RegExp(`^([a-z]+)(\\d*)$`, 'i');
  const matched = query.match(regex);

  if (matched) {
    const [_, letters, numbers] = matched;
    const now = dayjs();

    for (const [monthIndex, month] of monthNames.entries()) {
      const score = matchScore(month, letters);
      if (score <= bestScore) {
        continue;
      }

      const targetMonth = now.month(monthIndex);
      const daysInMonth = targetMonth.daysInMonth();
      const fallbackDay = Math.min(now.date(), daysInMonth);
      const parsedDay = numbers ? parseInt(numbers) : fallbackDay;
      const day =
        parsedDay < 1 || parsedDay > daysInMonth ? fallbackDay : parsedDay;

      bestScore = score;
      bestMatch = {
        dateString: targetMonth.date(day).format(JOURNAL_DATE_FORMAT),
      };
    }
  }

  return bestMatch;
}
