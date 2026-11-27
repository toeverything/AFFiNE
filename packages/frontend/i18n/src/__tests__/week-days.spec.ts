import { describe, expect, test } from 'vitest';

import { type Language, SUPPORTED_LANGUAGES } from '../resources';

// The date picker splits this string and renders it as a Sunday-first header
const weekDaysKey = 'com.affine.calendar-date-picker.week-days';

async function loadWeekDays() {
  const entries = await Promise.all(
    Object.entries(SUPPORTED_LANGUAGES).map(async ([locale, { resource }]) => {
      const loaded =
        typeof resource === 'function' ? (await resource()).default : resource;
      return {
        locale: locale as Language,
        labels: loaded[weekDaysKey]?.split(/[,،]/).map(label => label.trim()),
      };
    })
  );
  return entries.filter(
    (entry): entry is { locale: Language; labels: string[] } => !!entry.labels
  );
}

const locales = await loadWeekDays();

describe('calendar week days', () => {
  test.each(locales)('$locale has seven week days', ({ labels }) => {
    expect(labels).toHaveLength(7);
  });

  // Single-character labels can be compared with the platform's narrow
  // weekday names, which catches labels in the wrong order.
  test.each(
    locales.filter(({ labels }) =>
      labels.every(label => [...label].length === 1)
    )
  )('$locale starts on Sunday', ({ locale, labels }) => {
    const format = new Intl.DateTimeFormat(locale, {
      weekday: 'narrow',
      timeZone: 'UTC',
    });
    // 2023-01-01 is a Sunday
    const expected = Array.from({ length: 7 }, (_, day) =>
      format.format(new Date(Date.UTC(2023, 0, 1 + day)))
    );
    expect(labels).toEqual(expected);
  });
});
