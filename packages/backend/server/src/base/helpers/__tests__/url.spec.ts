import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import { buildCorsAllowedOrigins, isCorsOriginAllowed } from '../../cors';
import { ActionForbidden } from '../../error';
import { URLHelper } from '../url';

const test = ava as TestFn<{
  url: URLHelper;
}>;

test.beforeEach(async t => {
  t.context.url = new URLHelper({
    server: {
      externalUrl: '',
      host: 'app.affine.local',
      hosts: [],
      port: 3010,
      https: true,
      path: '',
    },
  } as any);
});

test('can factor base url correctly without specified external url', t => {
  t.is(t.context.url.baseUrl, 'https://app.affine.local');
});

test('can factor base url correctly with specified external url', t => {
  const url = new URLHelper({
    server: {
      externalUrl: 'https://external.domain.com',
      host: 'app.affine.local',
      hosts: [],
      port: 3010,
      https: true,
      path: '/ignored',
    },
  } as any);

  t.is(url.baseUrl, 'https://external.domain.com');
});

test('can factor base url correctly with specified external url and path', t => {
  const url = new URLHelper({
    server: {
      externalUrl: 'https://external.domain.com/anything',
      host: 'app.affine.local',
      hosts: [],
      port: 3010,
      https: true,
      path: '/ignored',
    },
  } as any);

  t.is(url.baseUrl, 'https://external.domain.com/anything');
});

test('can factor base url correctly with specified external url with port', t => {
  const url = new URLHelper({
    server: {
      externalUrl: 'https://external.domain.com:123',
      host: 'app.affine.local',
      hosts: [],
      port: 3010,
      https: true,
    },
  } as any);

  t.is(url.baseUrl, 'https://external.domain.com:123');
});

test('can stringify query', t => {
  t.is(t.context.url.stringify({ a: 1, b: 2 }), 'a=1&b=2');
  t.is(t.context.url.stringify({ a: 1, b: '/path' }), 'a=1&b=%2Fpath');
});

test('can create link', t => {
  t.is(t.context.url.link('/path'), 'https://app.affine.local/path');
  t.is(
    t.context.url.link('/path', { a: 1, b: 2 }),
    'https://app.affine.local/path?a=1&b=2'
  );
  t.is(
    t.context.url.link('/path', { a: 1, b: '/path' }),
    'https://app.affine.local/path?a=1&b=%2Fpath'
  );
});

test('can create safe link', t => {
  t.is(
    t.context.url.safeLink('/path?existing=1&token=old', {
      redirect_uri: '/next?a=1',
      token: 'a b',
    }),
    'https://app.affine.local/path?existing=1&redirect_uri=%2Fnext%3Fa%3D1&token=a+b'
  );
  t.is(t.context.url.safeLink('/%5Cevil'), 'https://app.affine.local/%5Cevil');
  for (const input of [
    '/\\\\evil.example/path',
    '\\\\evil.example/path',
    'https://user@app.affine.local/path',
    'javascript:alert(1)',
    'https://evil.example/path',
  ]) {
    t.throws(() => t.context.url.safeLink(input), {
      instanceOf: ActionForbidden,
    });
  }
  t.is(
    t.context.url.canonicalRedirectUri('https://github.com/path?existing=1', {
      error: 'a b',
    }),
    'https://github.com/path?existing=1&error=a+b'
  );
});

test('can canonicalize redirect_uri', t => {
  for (const [input, expected] of [
    ['/redirect-proxy', 'https://app.affine.local/redirect-proxy'],
    ['https://github.com', 'https://github.com/'],
    ['https://sub.github.com/path', 'https://sub.github.com/path'],
    ['https://github.com.:8443/path', 'https://github.com.:8443/path'],
  ]) {
    t.is(t.context.url.canonicalRedirectUri(input), expected);
  }
  for (const input of [
    '/\\\\evil.example/path',
    'https://app.affine.local:444/path',
    'https://evilgithub.com',
    'https://github.com.evil.example',
    'https://user@github.com',
    'javascript:alert(1)',
  ]) {
    t.throws(() => t.context.url.canonicalRedirectUri(input), {
      instanceOf: ActionForbidden,
    });
  }
});

test('can safe redirect', t => {
  const res = {
    redirect: (to: string) => to,
  } as any;

  const spy = Sinon.spy(res, 'redirect');
  function allow(to: string, canonical: string) {
    t.context.url.safeRedirect(res, to);
    t.true(spy.calledOnceWith(canonical));
    spy.resetHistory();
  }

  function deny(to: string) {
    t.context.url.safeRedirect(res, to);
    t.true(spy.calledOnceWith(t.context.url.baseUrl));
    spy.resetHistory();
  }

  allow('https://app.affine.local', 'https://app.affine.local/');
  allow('/path?query=1', 'https://app.affine.local/path?query=1');
  allow('/%5Cevil', 'https://app.affine.local/%5Cevil');
  [
    'https://other.domain.com',
    'a://invalid.uri',
    '/\\\\other.domain.com',
  ].forEach(deny);

  t.context.url.redirectAllowHosts = ['https://app.affine.local/base'];
  allow('/base/child', 'https://app.affine.local/base/child');
  ['/base-sibling', '/other'].forEach(deny);
});

test('can get request origin', t => {
  t.is(t.context.url.requestOrigin, 'https://app.affine.local');
});

test('can get request base url', t => {
  t.is(t.context.url.requestBaseUrl, 'https://app.affine.local');
});

test('can get request base url with multiple hosts', t => {
  // mock cls
  const cls = new Map<string, string>();
  const url = new URLHelper(
    {
      server: {
        externalUrl: '',
        host: 'app.affine.local1',
        hosts: ['app.affine.local1', 'app.affine.local2'],
        port: 3010,
        https: true,
        path: '',
      },
    } as any,
    cls as any
  );

  // no cls, use default origin
  t.is(url.requestOrigin, 'https://app.affine.local1');
  t.is(url.requestBaseUrl, 'https://app.affine.local1');

  // set cls
  cls.set(CLS_REQUEST_HOST, 'app.affine.local2');
  t.is(url.requestOrigin, 'https://app.affine.local2');
  t.is(url.requestBaseUrl, 'https://app.affine.local2');
});

test('should allow websocket secure origin by normalizing wss to https', t => {
  const allowedOrigins = buildCorsAllowedOrigins({
    allowedOrigins: ['https://app.affine.pro'],
  } as any);

  t.true(isCorsOriginAllowed('wss://app.affine.pro', allowedOrigins));
});

test('should allow desktop file origin', t => {
  const allowedOrigins = buildCorsAllowedOrigins({
    allowedOrigins: [],
  } as any);

  t.true(isCorsOriginAllowed('file://', allowedOrigins));
});
