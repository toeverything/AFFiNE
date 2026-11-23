import { describe, expect, test } from 'vitest';

import { isBlockedCleartextUrl, isLocalNetworkHost } from '.';
import hosts from './fixtures/hosts.json';

describe('isLocalNetworkHost', () => {
  test.each(hosts)('$host is local: $local', ({ host, local }) => {
    expect(isLocalNetworkHost(host)).toBe(local);
  });
});

describe('isBlockedCleartextUrl', () => {
  test.each([
    { url: 'http://affine.home.com/', blocked: true },
    { url: 'ws://example.com/socket.io/', blocked: true },
    { url: 'http://192.168.1.10:3010/', blocked: false },
    { url: 'ws://nas.local:3010/socket.io/', blocked: false },
    { url: 'http://[fe80::1]/', blocked: false },
    { url: 'https://affine.home.com/', blocked: false },
    { url: 'wss://example.com/', blocked: false },
  ])('$url is blocked: $blocked', ({ url, blocked }) => {
    expect(isBlockedCleartextUrl(new URL(url))).toBe(blocked);
  });
});
