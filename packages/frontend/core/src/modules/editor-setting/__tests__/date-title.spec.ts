import { getOrCreateI18n } from '@affine/i18n';
import { describe, expect, test } from 'vitest';

import {
  buildNewDocDateTitle,
  getUniqueNewDocDateTitle,
} from '../utils/date-title';

describe('date-title', () => {
  test('formats dates using DD-MM-YYYY', () => {
    expect(buildNewDocDateTitle('2026-03-23', 'DD-MM-YYYY')).toBe('23-03-2026');
  });

  test('formats dates using MM-DD-YYYY', () => {
    expect(buildNewDocDateTitle('2026-03-23', 'MM-DD-YYYY')).toBe('03-23-2026');
  });

  test('formats dates using YYYY-MM-DD', () => {
    expect(buildNewDocDateTitle('2026-03-23', 'YYYY-MM-DD')).toBe('2026-03-23');
  });

  test('formats dates using journal style', () => {
    getOrCreateI18n();
    expect(buildNewDocDateTitle('2026-03-23', 'journal')).toBe('Mar 23, 2026');
  });

  test('returns the base title when there is no collision', () => {
    expect(
      getUniqueNewDocDateTitle({
        existingTitles: ['Some title'],
        format: 'DD-MM-YYYY',
        date: '2026-03-23',
      })
    ).toBe('23-03-2026');
  });

  test('suffixes duplicate titles starting at (2)', () => {
    expect(
      getUniqueNewDocDateTitle({
        existingTitles: ['23-03-2026'],
        format: 'DD-MM-YYYY',
        date: '2026-03-23',
      })
    ).toBe('23-03-2026(2)');
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

  test('does not suffix when only duplicate-style titles exist', () => {
    expect(
      getUniqueNewDocDateTitle({
        existingTitles: ['23-03-2026(2)'],
        format: 'DD-MM-YYYY',
        date: '2026-03-23',
      })
    ).toBe('23-03-2026');
  });
});
