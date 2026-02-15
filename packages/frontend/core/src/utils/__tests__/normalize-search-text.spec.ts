import { expect, test } from 'vitest';

import { normalizeSearchText } from '../normalize-search-text';

test('normalizeSearchText should keep plain text unchanged', () => {
  expect(normalizeSearchText('hello world')).toBe('hello world');
});

test('normalizeSearchText should decode serialized single-item array', () => {
  expect(normalizeSearchText('["hello world"]')).toBe('hello world');
});

test('normalizeSearchText should decode serialized highlighted array', () => {
  expect(normalizeSearchText('["<b>hello</b> world"]')).toBe(
    '<b>hello</b> world'
  );
});

test('normalizeSearchText should join serialized multi-item array', () => {
  expect(normalizeSearchText('["hello","world"]')).toBe('hello world');
});

test('normalizeSearchText should decode serialized string', () => {
  expect(normalizeSearchText('"hello world"')).toBe('hello world');
});

test('normalizeSearchText should keep invalid serialized text unchanged', () => {
  expect(normalizeSearchText('["hello"')).toBe('["hello"');
});

test('normalizeSearchText should support array input', () => {
  expect(normalizeSearchText(['hello', 'world'])).toBe('hello world');
});
