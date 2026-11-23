import { getOrCreateI18n } from '@affine/i18n';
import { describe, expect, test } from 'vitest';

import {
  buildNewDocDateTitle,
  getUniqueNewDocDateTitle,
  resolveNewDocTitle,
} from '../utils/date-title';

describe('date-title', () => {
  test('formats dates using supported numeric formats', () => {
    expect(buildNewDocDateTitle('2026-03-23', 'DD-MM-YYYY')).toBe('23-03-2026');
    expect(buildNewDocDateTitle('2026-03-23', 'MM-DD-YYYY')).toBe('03-23-2026');
    expect(buildNewDocDateTitle('2026-03-23', 'YYYY-MM-DD')).toBe('2026-03-23');
  });

  test('formats dates using journal style', () => {
    getOrCreateI18n();
    expect(buildNewDocDateTitle('2026-03-23', 'journal')).toBe('Mar 23, 2026');
  });

  test('increments to the next available duplicate suffix', () => {
    expect(
      getUniqueNewDocDateTitle({
        existingTitles: [
          '23-03-2026',
          '23-03-2026(2)',
          '23-03-2026(3)',
          'Another doc',
        ],
        format: 'DD-MM-YYYY',
        date: '2026-03-23',
      })
    ).toBe('23-03-2026(4)');
  });

  test('keeps provided titles unchanged', () => {
    expect(
      resolveNewDocTitle({
        title: 'Typed by user',
        autoTitleEnabled: true,
        existingTitles: ['23-03-2026'],
        format: 'DD-MM-YYYY',
        date: '2026-03-23',
      })
    ).toBe('Typed by user');
  });

  test('returns undefined for blank titles when the feature is disabled', () => {
    expect(
      resolveNewDocTitle({
        autoTitleEnabled: false,
        existingTitles: ['23-03-2026'],
        format: 'DD-MM-YYYY',
        date: '2026-03-23',
      })
    ).toBeUndefined();
  });

  test('generates a unique title for blank docs when enabled', () => {
    expect(
      resolveNewDocTitle({
        autoTitleEnabled: true,
        existingTitles: ['23-03-2026', '23-03-2026(2)'],
        format: 'DD-MM-YYYY',
        date: '2026-03-23',
      })
    ).toBe('23-03-2026(3)');
  });
});
