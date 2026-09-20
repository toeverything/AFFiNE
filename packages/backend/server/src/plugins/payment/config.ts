import { defineModuleConfig } from '../../base';

export interface PaymentRuntimeConfig {
  showLifetimePrice: boolean;
}

declare global {
  interface AppConfigSchema {
    payment: {
      enabled: boolean;
      showLifetimePrice: boolean;
      stripe: ConfigItem<{
        /** Preferred place for Stripe API key */
        apiKey?: string;
        /** Preferred place for Stripe Webhook key */
        webhookKey?: string;
        /** Stripe account owning all canonical payment facts */
        accountId?: string;
        /** Stripe mode used to isolate canonical payment facts */
        environment?: 'test' | 'live';
      }>;
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
  stripe: {
    desc: 'Stripe sdk options and credentials',
    default: {
      apiKey: '',
      webhookKey: '',
      accountId: '',
      environment: 'test',
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
