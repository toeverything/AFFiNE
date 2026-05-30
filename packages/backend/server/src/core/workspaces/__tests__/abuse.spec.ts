import test from 'ava';

import {
  containsUrlOrDomain,
  isUserOldEnoughForShareActions,
  SHARE_ACTION_ACCOUNT_AGE_MS,
} from '../abuse';

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
  t.false(isUserOldEnoughForShareActions({ createdAt: new Date() }));
  t.true(
    isUserOldEnoughForShareActions({
      createdAt: new Date(Date.now() - SHARE_ACTION_ACCOUNT_AGE_MS - 1),
    })
  );
});
