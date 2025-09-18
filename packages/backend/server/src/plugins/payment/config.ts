import type { Stripe } from 'stripe';

import { defineModuleConfig } from '../../base';

export interface PaymentStartupConfig {
  stripe?: {
    keys: {
      APIKey: string;
      webhookKey: string;
    };
  } & Stripe.StripeConfig;
  revenuecat?: {
    apiKey?: string;
    webhookAuth?: string;
    enabled?: boolean;
    environment?: 'sandbox' | 'production';
    productMap?: Record<string, { plan: string; recurring: string }>;
  };
}

export interface PaymentRuntimeConfig {
  showLifetimePrice: boolean;
}

declare global {
  interface AppConfigSchema {
    payment: {
      enabled: boolean;
      showLifetimePrice: boolean;
      /**
       * @deprecated use payment.stripe.apiKey
       */
      apiKey: string;
      /**
       * @deprecated use payment.stripe.webhookKey
       */
      webhookKey: string;
      stripe: ConfigItem<
        {
          /** Preferred place for Stripe API key */
          apiKey?: string;
          /** Preferred place for Stripe Webhook key */
          webhookKey?: string;
        } & Stripe.StripeConfig
      >;
      revenuecat: ConfigItem<{
        /** Whether enable RevenueCat integration */
        enabled?: boolean;
        /** RevenueCat REST API Key */
        apiKey?: string;
        /** RevenueCat Project Id */
        projectId?: string;
        /** Authorization header value required by webhook */
        webhookAuth?: string;
        /** RC environment */
        environment?: 'sandbox' | 'production';
        /** Product whitelist mapping: productId -> { plan, recurring } */
        productMap?: Record<string, { plan: string; recurring: string }>;
      }>;
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
    desc: '[Deprecated] Stripe API key. Use payment.stripe.apiKey instead.',
    default: '',
    env: 'STRIPE_API_KEY',
  },
  webhookKey: {
    desc: '[Deprecated] Stripe webhook key. Use payment.stripe.webhookKey instead.',
    default: '',
    env: 'STRIPE_WEBHOOK_KEY',
  },
  stripe: {
    desc: 'Stripe sdk options and credentials',
    default: {
      apiKey: '',
      webhookKey: '',
    },
    link: 'https://docs.stripe.com/api',
  },
  revenuecat: {
    desc: 'RevenueCat integration configs',
    default: {
      enabled: false,
      apiKey: '',
      projectId: '',
      webhookAuth: '',
      environment: 'production',
      productMap: {},
    },
    link: 'https://www.revenuecat.com/docs/',
  },
});
