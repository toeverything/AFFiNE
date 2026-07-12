import { describe, expect, test } from 'vitest';

import { canonicalAuthEndpoint } from './endpoint';

describe('canonicalAuthEndpoint', () => {
  test.each([
    ['https://AFFINE.PRO/path?query=1', 'https://affine.pro'],
    ['https://affine.pro:443', 'https://affine.pro'],
    ['http://localhost:80/path', 'http://localhost'],
    ['http://localhost:8080/path', 'http://localhost:8080'],
    ['capacitor://localhost/path', 'capacitor://localhost/path'],
    ['invalid endpoint', 'invalid endpoint'],
  ])('normalizes %s', (endpoint, expected) => {
    expect(canonicalAuthEndpoint(endpoint)).toBe(expected);
  });
});
