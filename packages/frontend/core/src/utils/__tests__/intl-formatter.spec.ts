import { getI18n } from '@affine/i18n';
import { describe, expect, test } from 'vitest';

import type { CalendarTranslation } from '../intl-formatter';
import { timestampToCalendarDate } from '../intl-formatter';

const translation: CalendarTranslation = {
  yesterday: () => 'Yesterday',
  today: () => 'Today',
  tomorrow: () => 'Tomorrow',
  nextWeek: () => 'Next Week',
};

const ONE_DAY = 24 * 60 * 60 * 1000;

describe('intl calendar date formatter', () => {
  const week = new Intl.DateTimeFormat(getI18n()?.language, {
    weekday: 'long',
  });

  test('someday before last week', async () => {
    const timestamp = '2000-01-01 10:00';
    expect(timestampToCalendarDate(timestamp, translation)).toBe('Jan 1, 2000');
  });

  test('someday in last week', async () => {
    const timestamp = Date.now() - 6 * ONE_DAY;
    expect(timestampToCalendarDate(timestamp, translation)).toBe(
      week.format(timestamp)
    );
  });

  test('someday is yesterday', async () => {
    const timestamp = Date.now() - ONE_DAY;
    expect(timestampToCalendarDate(timestamp, translation)).toBe('Yesterday');
  });

  test('someday is today', async () => {
    const timestamp = Date.now();
    expect(timestampToCalendarDate(timestamp, translation)).toBe('Today');
  });

  test('someday is tomorrow', async () => {
    const timestamp = Date.now() + ONE_DAY;
    expect(timestampToCalendarDate(timestamp, translation)).toBe('Tomorrow');
  });

  test('someday in next week', async () => {
    const timestamp = Date.now() + 6 * ONE_DAY;
    expect(timestampToCalendarDate(timestamp, translation)).toBe(
      `Next Week ${week.format(timestamp)}`
    );
  });

  test('someday after next week', async () => {
    const timestamp = '3000-01-01 10:00';
    expect(timestampToCalendarDate(timestamp, translation)).toBe('Jan 1, 3000');
  });
});

describe('intl calendar date formatter with specific reference time', () => {
  const referenceTime = '2024-05-10 14:00';

  test('someday before last week', async () => {
    const timestamp = '2024-04-27 10:00';
    expect(timestampToCalendarDate(timestamp, translation, referenceTime)).toBe(
      'Apr 27, 2024'
    );
  });

  test('someday in last week', async () => {
    const timestamp = '2024-05-6 10:00';
    expect(timestampToCalendarDate(timestamp, translation, referenceTime)).toBe(
      'Monday'
    );
  });

  test('someday is yesterday', async () => {
    const timestamp = '2024-05-9 10:00';
    expect(timestampToCalendarDate(timestamp, translation, referenceTime)).toBe(
      'Yesterday'
    );
  });

  test('someday is today', async () => {
    const timestamp = '2024-05-10 10:00';
    expect(timestampToCalendarDate(timestamp, translation, referenceTime)).toBe(
      'Today'
    );
  });

  test('someday is tomorrow', async () => {
    const timestamp = '2024-05-11 10:00';
    expect(timestampToCalendarDate(timestamp, translation, referenceTime)).toBe(
      'Tomorrow'
    );
  });

  test('someday in next week', async () => {
    const timestamp = '2024-05-15 10:00';
    expect(timestampToCalendarDate(timestamp, translation, referenceTime)).toBe(
      'Next Week Wednesday'
    );
  });

  test('someday after next week', async () => {
    const timestamp = '2024-05-30 10:00';
    expect(timestampToCalendarDate(timestamp, translation, referenceTime)).toBe(
      'May 30, 2024'
    );
  });
});
