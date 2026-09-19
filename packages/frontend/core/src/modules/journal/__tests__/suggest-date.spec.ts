/**
 * @vitest-environment happy-dom
 */

import { JOURNAL_DATE_FORMAT } from '@affine/core/modules/journal';
import { I18n } from '@affine/i18n';
import dayjs from 'dayjs';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('emoji-mart', () => {
  return {
    Picker: vi.fn(),
  };
});

import { suggestJournalDate } from '../suggest-journal-date';

describe('suggestJournalDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('today', () => {
    expect(suggestJournalDate('t')).toEqual({
      dateString: dayjs().format(JOURNAL_DATE_FORMAT),
      alias: I18n.t('com.affine.today'),
    });
  });

  test('yesterday', () => {
    expect(suggestJournalDate('y')).toEqual({
      dateString: dayjs().subtract(1, 'day').format(JOURNAL_DATE_FORMAT),
      alias: I18n.t('com.affine.yesterday'),
    });
  });

  test('tomorrow', () => {
    expect(suggestJournalDate('tm')).toEqual({
      dateString: dayjs().add(1, 'day').format(JOURNAL_DATE_FORMAT),
      alias: I18n.t('com.affine.tomorrow'),
    });
  });

  test('last week - monday', () => {
    expect(suggestJournalDate('lm')).toEqual({
      dateString: dayjs()
        .subtract(1, 'week')
        .startOf('week')
        .add(1, 'day')
        .format(JOURNAL_DATE_FORMAT),
      alias: 'Last Monday',
    });
  });

  test('last week - tuesday', () => {
    expect(suggestJournalDate('ltt')).toEqual({
      dateString: dayjs()
        .subtract(1, 'week')
        .startOf('week')
        .add(2, 'day')
        .format(JOURNAL_DATE_FORMAT),
      alias: 'Last Tuesday',
    });
  });

  test('last week - wednesday', () => {
    expect(suggestJournalDate('lw')).toEqual({
      dateString: dayjs()
        .subtract(1, 'week')
        .startOf('week')
        .add(3, 'day')
        .format(JOURNAL_DATE_FORMAT),
      alias: 'Last Wednesday',
    });
  });

  test('last week - thursday', () => {
    expect(suggestJournalDate('lth')).toEqual({
      dateString: dayjs()
        .subtract(1, 'week')
        .startOf('week')
        .add(4, 'day')
        .format(JOURNAL_DATE_FORMAT),
      alias: 'Last Thursday',
    });
  });

  test('last week - friday', () => {
    expect(suggestJournalDate('lf')).toEqual({
      dateString: dayjs()
        .subtract(1, 'week')
        .startOf('week')
        .add(5, 'day')
        .format(JOURNAL_DATE_FORMAT),
      alias: 'Last Friday',
    });
  });

  test('next week - monday', () => {
    expect(suggestJournalDate('nm')).toEqual({
      dateString: dayjs()
        .add(1, 'week')
        .startOf('week')
        .add(1, 'day')
        .format(JOURNAL_DATE_FORMAT),
      alias: 'Next Monday',
    });
  });

  test('next week - tuesday', () => {
    expect(suggestJournalDate('nxtus')).toEqual({
      dateString: dayjs()
        .add(1, 'week')
        .startOf('week')
        .add(2, 'day')
        .format(JOURNAL_DATE_FORMAT),
      alias: 'Next Tuesday',
    });
  });

  test('next week - wednesday', () => {
    expect(suggestJournalDate('nw')).toEqual({
      dateString: dayjs()
        .add(1, 'week')
        .startOf('week')
        .add(3, 'day')
        .format(JOURNAL_DATE_FORMAT),
      alias: 'Next Wednesday',
    });
  });

  test('next week - thursday', () => {
    expect(suggestJournalDate('nth')).toEqual({
      dateString: dayjs()
        .add(1, 'week')
        .startOf('week')
        .add(4, 'day')
        .format(JOURNAL_DATE_FORMAT),
      alias: 'Next Thursday',
    });
  });

  test('next week - friday', () => {
    expect(suggestJournalDate('nf')).toEqual({
      dateString: dayjs()
        .add(1, 'week')
        .startOf('week')
        .add(5, 'day')
        .format(JOURNAL_DATE_FORMAT),
      alias: 'Next Friday',
    });
  });

  test.each([
    {
      now: new Date(2026, 8, 16, 12, 0, 0),
      query: 'dec',
      expected: '2026-12-16',
    },
    {
      now: new Date(2026, 8, 16, 12, 0, 0),
      query: 'dec 10',
      expected: '2026-12-10',
    },
    {
      now: new Date(2026, 8, 16, 12, 0, 0),
      query: 'feb 30',
      expected: '2026-02-16',
    },
    {
      now: new Date(2026, 0, 31, 12, 0, 0),
      query: 'feb',
      expected: '2026-02-28',
    },
    {
      now: new Date(2028, 0, 31, 12, 0, 0),
      query: 'feb',
      expected: '2028-02-29',
    },
    {
      now: new Date(2028, 8, 16, 12, 0, 0),
      query: 'feb 29',
      expected: '2028-02-29',
    },
  ])('$query resolves to $expected', ({ now, query, expected }) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(suggestJournalDate(query)).toEqual({
      dateString: expected,
    });
  });
});
