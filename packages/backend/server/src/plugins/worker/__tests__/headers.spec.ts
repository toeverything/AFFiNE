import ava from 'ava';

import { isRefererAllowed } from '../utils';

const test = ava;

const allowed = [
  'https://app.affine.local',
  'assets://.',
  'capacitor://localhost',
  'file://',
];

test('allows a referer on an http(s) origin from the list', t => {
  t.true(isRefererAllowed('https://app.affine.local/workspace/1', allowed));
  t.false(isRefererAllowed('https://other.example/workspace/1', allowed));
});

test('allows a referer on a custom-scheme client origin from the list', t => {
  // URL.origin is "null" for these, so they need the serialized form
  t.true(isRefererAllowed('assets://./', allowed));
  t.true(isRefererAllowed('assets://./index.html', allowed));
  t.true(isRefererAllowed('capacitor://localhost/', allowed));
  t.true(isRefererAllowed('file:///app/index.html', allowed));
});

test('rejects a custom-scheme referer that is not in the list', t => {
  t.false(isRefererAllowed('assets://another-host/', allowed));
  t.false(isRefererAllowed('capacitor://evil.example/', allowed));
  t.false(isRefererAllowed('not a url', allowed));
});
