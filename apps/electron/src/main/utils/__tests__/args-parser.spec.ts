import { describe, expect, test } from 'vitest';

import { argsParser } from '../args-parser';

describe('args-parser', async () => {
  test('app name', () => {
    const prev = process.argv;
    process.argv = ['node', 'file.js', '--app-name', 'test'];
    const res = argsParser();
    expect(res.appName).toBe('test');
    process.argv = prev;
  });
});
