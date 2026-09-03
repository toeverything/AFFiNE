import type { Stripe } from 'stripe';
import { z } from 'zod';

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
  dubAffiliateEnabled: boolean;
  dubAffiliateExcludedPromotionCodes: string[];
}

declare global {
  interface AppConfigSchema {
    payment: {
      enabled: boolean;
      showLifetimePrice: boolean;
      dubAffiliateEnabled: boolean;
      dubAffiliateExcludedPromotionCodes: ConfigItem<string[]>;
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
  dubAffiliateEnabled: {
    desc: 'Whether to attribute eligible Stripe customers to Dub affiliates.',
    default: false,
  },
  dubAffiliateExcludedPromotionCodes: {
    desc: 'Promotion codes that must not also receive Dub attribution.',
    default: [],
    shape: z.array(z.string()),
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
