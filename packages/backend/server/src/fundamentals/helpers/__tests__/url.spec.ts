import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import { URLHelper } from '../url';

const test = ava as TestFn<{
  url: URLHelper;
}>;

test.beforeEach(async t => {
  t.context.url = new URLHelper({
    server: {
      externalUrl: '',
      host: 'app.affine.local',
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
    t.true(spy.calledOnceWith(t.context.url.home));
    spy.resetHistory();
  }

  [
    'https://app.affine.local',
    'https://app.affine.local/path',
    'https://app.affine.local/path?query=1',
  ].forEach(allow);
  ['https://other.domain.com', 'a://invalid.uri'].forEach(deny);
});
