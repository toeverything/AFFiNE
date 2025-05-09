/**
 * @vitest-environment happy-dom
 */

import { JOURNAL_DATE_FORMAT } from '@affine/core/modules/journal';
import { I18n } from '@affine/i18n';
import dayjs from 'dayjs';
import { describe, expect, test, vi } from 'vitest';

vi.mock('emoji-mart', () => {
  return {
    Picker: vi.fn(),
  };
});

import { suggestJournalDate } from '../suggest-journal-date';

describe('suggestJournalDate', () => {
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

  test('dec', () => {
    const year = dayjs().year();
    const date = dayjs().date();
    expect(suggestJournalDate(`dec`)).toEqual({
      dateString: dayjs(`${year}-12-${date}`).format(JOURNAL_DATE_FORMAT),
    });
  });

  test('dec 1', () => {
    const year = dayjs().year();
    expect(suggestJournalDate(`dec 10`)).toEqual({
      dateString: dayjs(`${year}-12-10`).format(JOURNAL_DATE_FORMAT),
    });
  });

  test('dec 33', () => {
    const year = dayjs().year();
    const date = dayjs().date();
    expect(suggestJournalDate(`dec 33`)).toEqual({
      dateString: dayjs(`${year}-12-${date}`).format(JOURNAL_DATE_FORMAT),
    });
  });
});
