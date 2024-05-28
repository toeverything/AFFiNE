import type { Stripe } from 'stripe';

import { defineStartupConfig, ModuleConfig } from '../../fundamentals/config';

export interface PaymentStartupConfig {
  stripe?: {
    keys: {
      APIKey: string;
      webhookKey: string;
    };
  } & Stripe.StripeConfig;
}

declare module '../config' {
  interface PluginsConfig {
    payment: ModuleConfig<PaymentStartupConfig>;
  }
}

defineStartupConfig('plugins.payment', {});
