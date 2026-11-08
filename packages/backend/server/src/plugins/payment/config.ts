import serverNativeModule from '@affine/server-native';

import { defineNativeModuleConfig } from '../../base';

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

defineNativeModuleConfig(
  'payment',
  serverNativeModule.appConfigDescriptors('payment'),
  serverNativeModule.validateAppConfigValue,
  {
    showLifetimePrice: {
      desc: 'Whether enable lifetime price and allow user to pay for it.',
      default: true,
    },
  }
);
