import { expect, test } from 'vitest';

import {
  buildAuthenticationDeepLink,
  buildOpenAppUrlRoute,
  normalizeOpenAppSignInNextParam,
  resolveDeepLinkRoute,
} from '../utils';

test('buildAuthenticationDeepLink', () => {
  const payload = { code: '1', next: '/workspace/123' };
  const url = buildAuthenticationDeepLink({
    scheme: 'affine',
    method: 'open-app-signin',
    payload,
    server: 'https://app.affine.local',
  });

  const parsed = new URL(url);

  expect(parsed.protocol).toBe('affine:');
  expect(parsed.hostname).toBe('authentication');
  expect(parsed.searchParams.get('method')).toBe('open-app-signin');
  expect(parsed.searchParams.get('payload')).toBe(JSON.stringify(payload));
  expect(parsed.searchParams.get('server')).toBe('https://app.affine.local');
});

test('buildOpenAppUrlRoute', () => {
  const urlToOpen = 'affine://authentication?method=oauth&payload=%7B%7D';
  const route = buildOpenAppUrlRoute(urlToOpen);

  const parsed = new URL(route, 'https://app.affine.local');
  expect(parsed.pathname).toBe('/open-app/url');
  expect(parsed.searchParams.get('url')).toBe(urlToOpen);
});

test('normalizeOpenAppSignInNextParam', () => {
  expect(
    normalizeOpenAppSignInNextParam(
      '/workspace/123',
      'https://app.affine.local'
    )
  ).toBe('/workspace/123');

  expect(
    normalizeOpenAppSignInNextParam(
      'https://app.affine.local/workspace/123?foo=1#bar',
      'https://app.affine.local'
    )
  ).toBe('/workspace/123?foo=1#bar');

  expect(
    normalizeOpenAppSignInNextParam(
      'https://evil.example/workspace/123',
      'https://app.affine.local'
    )
  ).toBeUndefined();

  expect(
    normalizeOpenAppSignInNextParam(
      '//evil.example/workspace/123',
      'https://app.affine.local'
    )
  ).toBeUndefined();

  expect(
    normalizeOpenAppSignInNextParam(
      '/redirect-proxy?redirect_uri=https://evil.example',
      'https://app.affine.local'
    )
  ).toBeUndefined();
});

test('resolveDeepLinkRoute', () => {
  expect(
    resolveDeepLinkRoute(
      'affine://app.affine.pro/workspace/ws/doc?new-tab=1&mode=edgeless#'
    )
  ).toBe('/workspace/ws/doc?mode=edgeless');

  expect(
    resolveDeepLinkRoute(
      'affine://notes.example.com/workspace/ws/doc?new-tab=1&server=https%3A%2F%2Fnotes.example.com#blockId'
    )
  ).toBe('/workspace/ws/doc?server=https%3A%2F%2Fnotes.example.com#blockId');

  expect(resolveDeepLinkRoute('affine://app.affine.pro/share/ws/doc')).toBe(
    '/share/ws/doc'
  );

  expect(
    resolveDeepLinkRoute('affine://authentication?method=oauth&payload=%7B%7D')
  ).toBeUndefined();
  expect(resolveDeepLinkRoute('affine://app.affine.pro/')).toBeUndefined();
  expect(resolveDeepLinkRoute('affine://share-inbox')).toBeUndefined();
  expect(
    resolveDeepLinkRoute('affine-canary://affine.fail/workspace/ws/doc')
  ).toBeUndefined();
  expect(
    resolveDeepLinkRoute('affine://app.affine.pro/settings')
  ).toBeUndefined();
  expect(
    resolveDeepLinkRoute('affine://app.affine.pro/workspaces')
  ).toBeUndefined();
  expect(
    resolveDeepLinkRoute('https://app.affine.pro/workspace/ws/doc')
  ).toBeUndefined();
  expect(resolveDeepLinkRoute('affine://[invalid/workspace')).toBeUndefined();
  expect(resolveDeepLinkRoute('not a url')).toBeUndefined();
});
