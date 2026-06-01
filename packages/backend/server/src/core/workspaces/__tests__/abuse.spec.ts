import test from 'ava';

import { canUserExecuteLimitedActions, containsUrlOrDomain } from '../abuse';

test('should detect links and bare domains in workspace names', t => {
  t.true(containsUrlOrDomain('BTC https://spam.example'));
  t.true(containsUrlOrDomain('Join spam.example now'));
  t.true(containsUrlOrDomain('Join spam.example, ltd'));
  t.true(containsUrlOrDomain('Join spam.example。'));
  t.true(containsUrlOrDomain('www.spam.example'));
});

test('should not detect email addresses or partial domain words', t => {
  t.false(containsUrlOrDomain('Contact user@spam.example'));
  t.false(containsUrlOrDomain('spam.example_btc'));
});

test('should check account age for share actions', t => {
  const minimumAccountAgeMs = 24 * 60 * 60 * 1000;

  t.false(
    canUserExecuteLimitedActions({ createdAt: new Date() }, minimumAccountAgeMs)
  );
  t.true(
    canUserExecuteLimitedActions(
      {
        createdAt: new Date(Date.now() - minimumAccountAgeMs - 1),
      },
      minimumAccountAgeMs
    )
  );
});

test('should skip account age check when share action delay is disabled', t => {
  t.true(canUserExecuteLimitedActions({ createdAt: new Date() }, 0));
});
