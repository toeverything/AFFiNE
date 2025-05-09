import type { Stripe } from 'stripe';

import { defineModuleConfig } from '../../base';

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

declare global {
  interface AppConfigSchema {
    payment: {
      enabled: boolean;
      showLifetimePrice: boolean;
      apiKey: string;
      webhookKey: string;
      stripe: ConfigItem<{} & Stripe.StripeConfig>;
    };
  }
}

defineModuleConfig('payment', {
  enabled: {
    desc: 'Whether enable payment plugin',
    default: false,
  },
  showLifetimePrice: {
    desc: 'Whether enable lifetime price and allow user to pay for it.',
    default: true,
  },
  apiKey: {
    desc: 'Stripe API key to enable payment service.',
    default: '',
    env: 'STRIPE_API_KEY',
  },
  webhookKey: {
    desc: 'Stripe webhook key to enable payment service.',
    default: '',
    env: 'STRIPE_WEBHOOK_KEY',
  },
  stripe: {
    desc: 'Stripe sdk options',
    default: {},
    link: 'https://docs.stripe.com/api',
  },
});
