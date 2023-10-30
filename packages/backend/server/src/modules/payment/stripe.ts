import { FactoryProvider } from '@nestjs/common';
import { omit } from 'lodash-es';
import Stripe from 'stripe';

import { Config } from '../../config';

export const StripeProvider: FactoryProvider = {
  provide: Stripe,
  useFactory: (config: Config) => {
    const stripeConfig = config.payment.stripe;

    return new Stripe(
      stripeConfig.keys.APIKey,
      omit(config.payment.stripe, 'keys', 'prices')
    );
  },
  inject: [Config],
};
