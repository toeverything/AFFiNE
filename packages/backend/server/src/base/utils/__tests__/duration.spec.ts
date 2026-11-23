import test from 'ava';

import { Due } from '../duration';

test('should parse duration strings correctly', t => {
  const testcases = [
    '1ms',
    '1s',
    '1m',
    '1h',
    '1d',
    '1w',
    '1M',
    '1y',
    '1000ms',
    '60s',
    '30m',
    '1h30m',
    '15d',
    '1y',
    '12M',
    '1y1M1d1h1m1s1ms',
  ];

  for (const str of testcases) {
    t.snapshot(JSON.stringify(Due.parse(str)), `parser - ${str}`);
    t.snapshot(Due.ms(str), `ms - ${str}`);
  }
});

test('should calc relative time correctly', t => {
  const date = new Date();
  t.is(Due.before('1d', date).getTime(), date.getTime() - 1000 * 60 * 60 * 24);

  const date2 = new Date();
  t.is(Due.after('1d', date2).getTime(), date2.getTime() + 1000 * 60 * 60 * 24);
});
