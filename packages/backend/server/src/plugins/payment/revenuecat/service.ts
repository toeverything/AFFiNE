import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { Config } from '../../../base';

const Store = z.enum([
  'amazon',
  'app_store',
  'mac_app_store',
  'play_store',
  'promotional',
  'stripe',
  'rc_billing',
  'roku',
  'paddle',
]);

const zRcV2RawProduct = z
  .object({
    id: z.string().nonempty(),
    store_identifier: z.string().nonempty(),
    subscription: z
      .object({ duration: z.string().nullable() })
      .partial()
      .nullable(),
    app: z.object({ type: Store }).partial(),
  })
  .passthrough();

const zRcV2RawEntitlementItem = z
  .object({
    lookup_key: z.string().nonempty(),
    display_name: z.string().nonempty(),
    products: z
      .object({ items: z.array(zRcV2RawProduct).default([]) })
      .partial()
      .nullable(),
  })
  .passthrough();

const zRcV2RawEntitlements = z
  .object({ items: z.array(zRcV2RawEntitlementItem).default([]) })
  .partial();

const zRcV2RawSubscription = z
  .object({
    object: z.enum(['subscription']),
    entitlements: zRcV2RawEntitlements,
    starts_at: z.number(),
    current_period_ends_at: z.number().nullable(),
    store: Store,
    auto_renewal_status: z.enum([
      'will_renew',
      'will_not_renew',
      'will_change_product',
      'will_pause',
      'requires_price_increase_consent',
      'has_already_renewed',
    ]),
    status: z.enum([
      'trialing',
      'active',
      'expired',
      'in_grace_period',
      'in_billing_retry',
      'paused',
      'unknown',
      'incomplete',
    ]),
    gives_access: z.boolean(),
  })
  .passthrough();

const zRcV2RawEnvelope = z
  .object({
    app_user_id: z.string().optional(),
    id: z.string().optional(),
    subscriptions: z.array(zRcV2RawSubscription).default([]),
  })
  .passthrough();

// v2 minimal, simplified structure exposed to callers
export const Subscription = z.object({
  identifier: z.string(),
  isTrial: z.boolean(),
  isActive: z.boolean(),
  latestPurchaseDate: z.date().nullable(),
  expirationDate: z.date().nullable(),
  productId: z.string(),
  store: Store,
  willRenew: z.boolean(),
  duration: z.string().nullable(),
});

export type Subscription = z.infer<typeof Subscription>;

@Injectable()
export class RevenueCatService {
  constructor(private readonly config: Config) {}

  private get apiKey(): string {
    const key = this.config.payment.revenuecat?.apiKey;
    if (!key) {
      throw new Error('RevenueCat API key is not configured');
    }
    return key;
  }

  private get projectId(): string {
    const id = this.config.payment.revenuecat?.projectId;
    if (!id) {
      throw new Error('RevenueCat Project ID is not configured');
    }
    return id;
  }

  async getSubscriptions(customerId: string): Promise<Subscription[] | null> {
    const res = await fetch(
      `https://api.revenuecat.com/v2/projects/${this.projectId}/customers/${customerId}/subscriptions`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `RevenueCat getSubscriber failed: ${res.status} ${res.statusText} - ${text}`
      );
    }

    const envParsed = zRcV2RawEnvelope.safeParse(await res.json());

    if (envParsed.success) {
      return envParsed.data.subscriptions
        .flatMap(sub => {
          const items = sub.entitlements.items ?? [];
          return items.map(ent => {
            const product = ent.products?.items?.[0];
            if (!product) {
              return null;
            }
            return {
              identifier: ent.lookup_key,
              isTrial: sub.status === 'trialing',
              isActive:
                sub.gives_access === true ||
                sub.status === 'active' ||
                sub.status === 'trialing',
              latestPurchaseDate: sub.starts_at
                ? new Date(sub.starts_at * 1000)
                : null,
              expirationDate: sub.current_period_ends_at
                ? new Date(sub.current_period_ends_at * 1000)
                : null,
              productId: product.store_identifier,
              store: sub.store ?? product.app.type,
              willRenew: sub.auto_renewal_status === 'will_renew',
              duration: product.subscription?.duration ?? null,
            };
          });
        })
        .filter((s): s is Subscription => s !== null);
    }
    return null;
  }
}
