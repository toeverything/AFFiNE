import { describe, expect, test } from 'vitest';

import { EditorSettingSchema } from '../schema';

describe('EditorSettingSchema', () => {
  test('codeBlockLineNumbers defaults to true', () => {
    const result = EditorSettingSchema.parse({});
    expect(result.codeBlockLineNumbers).toBe(true);
  });

  test('codeBlockLineNumbers accepts false', () => {
    const result = EditorSettingSchema.parse({ codeBlockLineNumbers: false });
    expect(result.codeBlockLineNumbers).toBe(false);
  });

  test('codeBlockLineNumbers accepts true explicitly', () => {
    const result = EditorSettingSchema.parse({ codeBlockLineNumbers: true });
    expect(result.codeBlockLineNumbers).toBe(true);
  });

  test('codeBlockLineNumbers rejects non-boolean values', () => {
    expect(() =>
      EditorSettingSchema.parse({ codeBlockLineNumbers: 'yes' })
    ).toThrow();
  });
});
