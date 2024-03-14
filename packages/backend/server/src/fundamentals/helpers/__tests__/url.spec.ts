import { Test } from '@nestjs/testing';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import { ConfigModule } from '../../config';
import { URLHelper } from '../url';

const test = ava as TestFn<{
  url: URLHelper;
}>;

test.beforeEach(async t => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        host: 'app.affine.local',
        port: 3010,
        https: true,
      }),
    ],
    providers: [URLHelper],
  }).compile();

  t.context.url = module.get(URLHelper);
});

test('can get home page', t => {
  t.is(t.context.url.home, 'https://app.affine.local');
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
