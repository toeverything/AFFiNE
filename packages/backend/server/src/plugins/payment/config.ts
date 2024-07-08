import type { Stripe } from 'stripe';

import {
  defineRuntimeConfig,
  defineStartupConfig,
  ModuleConfig,
} from '../../fundamentals/config';

export interface PaymentStartupConfig {
  stripe?: {
    keys: {
      APIKey: string;
      webhookKey: string;
    };
  } & Stripe.StripeConfig;
}

export interface PaymentRuntimeConfig {
  showLifetimePrice: boolean;
}

declare module '../config' {
  interface PluginsConfig {
    payment: ModuleConfig<PaymentStartupConfig, PaymentRuntimeConfig>;
  }
}

defineStartupConfig('plugins.payment', {});
defineRuntimeConfig('plugins.payment', {
  showLifetimePrice: {
    desc: 'Whether enable lifetime price and allow user to pay for it.',
    default: false,
  },
});
