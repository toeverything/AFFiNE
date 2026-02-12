import { describe, expect, test } from 'vitest';

import { isAllowedRedirectTarget } from '../redirect-allowlist';

describe('redirect allowlist', () => {
  test('allows same hostname', () => {
    expect(
      isAllowedRedirectTarget('https://self.example.com/path', {
        currentHostname: 'self.example.com',
      })
    ).toBe(true);
  });

  test('allows trusted domains and subdomains', () => {
    expect(
      isAllowedRedirectTarget('https://github.com/toeverything/AFFiNE', {
        currentHostname: 'self.example.com',
      })
    ).toBe(true);

    expect(
      isAllowedRedirectTarget('https://sub.github.com/foo', {
        currentHostname: 'self.example.com',
      })
    ).toBe(true);
  });

  test('blocks look-alike domains', () => {
    expect(
      isAllowedRedirectTarget('https://evilgithub.com', {
        currentHostname: 'self.example.com',
      })
    ).toBe(false);
  });

  test('blocks disallowed protocols', () => {
    expect(
      isAllowedRedirectTarget('javascript:alert(1)', {
        currentHostname: 'self.example.com',
      })
    ).toBe(false);
  });

  test('handles port and trailing dot', () => {
    expect(
      isAllowedRedirectTarget('https://github.com:8443', {
        currentHostname: 'self.example.com',
      })
    ).toBe(true);

    expect(
      isAllowedRedirectTarget('https://affine.pro./', {
        currentHostname: 'self.example.com',
      })
    ).toBe(true);
  });

  test('blocks punycode homograph', () => {
    // "а" is Cyrillic small a (U+0430), different from Latin "a"
    expect(
      isAllowedRedirectTarget('https://аffine.pro', {
        currentHostname: 'self.example.com',
      })
    ).toBe(false);
  });
});
