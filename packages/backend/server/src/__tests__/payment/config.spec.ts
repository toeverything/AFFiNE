import '../../plugins/payment/config';

import test from 'ava';

import { ConfigFactory } from '../../base';

test('Dub affiliate runtime config defaults are isolated between factories', t => {
  const first = new ConfigFactory();

  t.false(first.config.payment.dubAffiliateEnabled);
  t.deepEqual(first.config.payment.dubAffiliateExcludedPromotionCodes, []);

  first.config.payment.dubAffiliateExcludedPromotionCodes.push('legacy-code');

  const second = new ConfigFactory();
  t.false(second.config.payment.dubAffiliateEnabled);
  t.deepEqual(second.config.payment.dubAffiliateExcludedPromotionCodes, []);
});

test('Dub affiliate runtime config can be overridden without sharing state', t => {
  const first = new ConfigFactory({
    payment: {
      dubAffiliateEnabled: true,
      dubAffiliateExcludedPromotionCodes: ['legacy-code'],
    },
  });

  t.true(first.config.payment.dubAffiliateEnabled);
  t.deepEqual(first.config.payment.dubAffiliateExcludedPromotionCodes, [
    'legacy-code',
  ]);

  const second = new ConfigFactory();
  t.false(second.config.payment.dubAffiliateEnabled);
  t.deepEqual(second.config.payment.dubAffiliateExcludedPromotionCodes, []);
});
