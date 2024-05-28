import assert from 'node:assert';

import { FactoryProvider } from '@nestjs/common';
import { omit } from 'lodash-es';
import Stripe from 'stripe';

import { Config } from '../../fundamentals';

export const StripeProvider: FactoryProvider = {
  provide: Stripe,
  useFactory: (config: Config) => {
    const stripeConfig = config.plugins.payment.stripe;
    assert(stripeConfig, 'Stripe configuration is missing');

    return new Stripe(stripeConfig.keys.APIKey, omit(stripeConfig, 'keys'));
  },
  inject: [Config],
};
