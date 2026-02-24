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

test('addSimpleQuery should not double encode', t => {
  t.is(
    t.context.url.addSimpleQuery(
      'https://app.affine.local/path',
      'redirect_uri',
      '/path'
    ),
    'https://app.affine.local/path?redirect_uri=%2Fpath'
  );
});

test('addSimpleQuery should allow unescaped value when escape=false', t => {
  t.is(
    t.context.url.addSimpleQuery(
      'https://app.affine.local/path',
      'session_id',
      '{CHECKOUT_SESSION_ID}',
      false
    ),
    'https://app.affine.local/path?session_id={CHECKOUT_SESSION_ID}'
  );
});

test('can validate callbackUrl allowlist', t => {
  t.true(t.context.url.isAllowedCallbackUrl('/magic-link'));
  t.true(
    t.context.url.isAllowedCallbackUrl('https://app.affine.local/magic-link')
  );
  t.false(
    t.context.url.isAllowedCallbackUrl('https://evil.example/magic-link')
  );
});

test('can validate redirect_uri allowlist', t => {
  t.true(t.context.url.isAllowedRedirectUri('/redirect-proxy'));
  t.true(t.context.url.isAllowedRedirectUri('https://github.com'));
  t.false(t.context.url.isAllowedRedirectUri('javascript:alert(1)'));
  t.false(t.context.url.isAllowedRedirectUri('https://evilgithub.com'));
});

test('can create safe link', t => {
  t.is(t.context.url.safeLink('/path'), 'https://app.affine.local/path');
  t.throws(() => t.context.url.safeLink('https://evil.example/magic-link'), {
    instanceOf: ActionForbidden,
  });
});

test('can safe redirect', t => {
  const res = {
    redirect: (to: string) => to,
  } as any;

  const spy = Sinon.spy(res, 'redirect');
  function allow(to: string) {
    t.context.url.safeRedirect(res, to);
    t.true(spy.calledOnceWith(to));
    spy.resetHistory();
  }

  function deny(to: string) {
    t.context.url.safeRedirect(res, to);
    t.true(spy.calledOnceWith(t.context.url.baseUrl));
    spy.resetHistory();
  }

  [
    'https://app.affine.local',
    'https://app.affine.local/path',
    'https://app.affine.local/path?query=1',
  ].forEach(allow);
  ['https://other.domain.com', 'a://invalid.uri'].forEach(deny);
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
