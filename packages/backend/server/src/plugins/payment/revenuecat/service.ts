import { Injectable, Logger } from '@nestjs/common';
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
    display_name: z.string().nonempty(),
    store_identifier: z.string().nonempty(),
    subscription: z
      .object({ duration: z.string().nullable() })
      .partial()
      .nullable(),
    app: z.object({ type: Store }).partial().nullish(),
  })
  .passthrough();

const zRcV2RawEntitlementItem = z
  .object({
    id: z.string().nonempty(),
    lookup_key: z.string().nonempty(),
    display_name: z.string().nonempty(),
    products: z
      .object({ items: z.array(zRcV2RawProduct).default([]) })
      .partial()
      .nullish(),
  })
  .passthrough();

const zRcV2RawEntitlements = z
  .object({ items: z.array(zRcV2RawEntitlementItem).default([]) })
  .partial();

const zRcV2RawSubscription = z
  .object({
    object: z.enum(['subscription']),
    id: z.string().nonempty(),
    customer_id: z.string().nonempty().nullish(),
    product_id: z.string().nonempty().nullable(),
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

const zRcV2RawSubscriptionEnvelope = z
  .object({
    app_user_id: z.string().optional(),
    id: z.string().optional(),
    items: z.array(zRcV2RawSubscription).default([]),
  })
  .passthrough();

const zRcV2RawCustomerAlias = z
  .object({
    object: z.literal('customer.alias'),
    id: z.string().nonempty(),
    created_at: z.number(),
  })
  .passthrough();

const zRcV2RawCustomerAliasEnvelope = z
  .object({
    items: z.array(zRcV2RawCustomerAlias).default([]),
  })
  .passthrough();

// v2 minimal, simplified structure exposed to callers
export const Subscription = z.object({
  identifier: z.string(),
  isTrial: z.boolean(),
  isActive: z.boolean(),
  latestPurchaseDate: z.date().nullable(),
  expirationDate: z.date().nullable(),
  customerId: z.string().optional(),
  productId: z.string(),
  store: Store,
  willRenew: z.boolean(),
  duration: z.string().nullable(),
});

const IdentifyUserResponse = z.object({
  was_created: z.boolean(),
});

export type Subscription = z.infer<typeof Subscription>;
type Entitlement = z.infer<typeof zRcV2RawEntitlementItem>;
type Product = z.infer<typeof zRcV2RawProduct>;

@Injectable()
export class RevenueCatService {
  private readonly logger = new Logger(RevenueCatService.name);
  private readonly productsCache = new Map<string, Product[]>();

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

  async identifyUser(userId: string, newUserId: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://api.revenuecat.com/v1/subscribers/identify`,
        {
          method: 'POST',
          body: JSON.stringify({
            app_user_id: userId,
            new_app_user_id: newUserId,
          }),
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const json = await res.json();
      const parsed = IdentifyUserResponse.safeParse(json);
      if (parsed.success) {
        return parsed.data.was_created;
      } else {
        this.logger.error(
          `RevenueCat identifyUser parse failed: ${JSON.stringify(
            parsed.error.format()
          )}`
        );
        return false;
      }
    } catch (e: any) {
      this.logger.error(`RevenueCat identifyUser failed: ${e.message}`);
      return false;
    }
  }

  async getProducts(ent: Entitlement): Promise<Product[] | null> {
    if (ent.products?.items && ent.products.items.length > 0) {
      return ent.products.items;
    }
    const entId = ent.id;
    const cachedProduct = this.productsCache.get(entId);
    if (cachedProduct) {
      return cachedProduct;
    }

    const res = await fetch(
      `https://api.revenuecat.com/v2/projects/${this.projectId}/entitlements/${entId}?expand=product`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(
        `RevenueCat getProducts failed: ${res.status} ${res.statusText} - ${text}`
      );
      return null;
    }

    const json = await res.json();
    const entParsed = zRcV2RawEntitlementItem.safeParse(json);
    if (entParsed.success) {
      const products = entParsed.data.products?.items || null;
      if (products) {
        this.productsCache.set(entId, products);
      }
      return products;
    }
    this.logger.error(
      `RevenueCat entitlement ${entId} parse failed: ${JSON.stringify(
        entParsed.error.format()
      )}`
    );
    return null;
  }

  async getCustomerAlias(
    customerId: string,
    filterAlias = true
  ): Promise<string[] | null> {
    const res = await fetch(
      `https://api.revenuecat.com/v2/projects/${this.projectId}/customers/${customerId}/aliases`,
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
        `RevenueCat getCustomerAlias failed: ${res.status} ${res.statusText} - ${text}`
      );
    }

    const json = await res.json();
    const customerParsed = zRcV2RawCustomerAliasEnvelope.safeParse(json);

    if (customerParsed.success) {
      const customer = customerParsed.data.items.map(alias => alias.id);
      if (filterAlias) {
        return customer.filter(id => !id.startsWith('$RCAnonymousID:'));
      } else {
        return customer;
      }
    }
    this.logger.error(
      `RevenueCat customer ${customerId} parse failed: ${JSON.stringify(
        customerParsed.error.format()
      )}`
    );
    return null;
  }

  async getSubscriptionByExternalRef(
    externalRef: string
  ): Promise<Subscription[] | null> {
    const res = await fetch(
      `https://api.revenuecat.com/v2/projects/${this.projectId}/subscriptions?store_subscription_identifier=${encodeURIComponent(externalRef)}`,
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
        `RevenueCat getSubscriptionByExternalRef failed: ${res.status} ${res.statusText} - ${text}`
      );
    }

    const json = await res.json();
    const envParsed = zRcV2RawSubscriptionEnvelope.safeParse(json);

    if (envParsed.success) {
      const parsedSubs = await Promise.all(
        envParsed.data.items.flatMap(async sub => this.parseSubscription(sub))
      );
      return parsedSubs.filter((s): s is Subscription => s !== null);
    }
    this.logger.error(
      `RevenueCat subscription parse failed: ${JSON.stringify(
        envParsed.error.format()
      )}`
    );
    return null;
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

    const json = await res.json();
    const envParsed = zRcV2RawSubscriptionEnvelope.safeParse(json);

    if (envParsed.success) {
      const parsedSubs = await Promise.all(
        envParsed.data.items.flatMap(async sub => this.parseSubscription(sub))
      );
      return parsedSubs.filter((s): s is Subscription => s !== null);
    }
    this.logger.error(
      `RevenueCat subscription parse failed: ${JSON.stringify(
        envParsed.error.format()
      )}`
    );
    return null;
  }

  private async parseSubscription(
    sub: z.infer<typeof zRcV2RawSubscription>
  ): Promise<Subscription | null> {
    const items = sub.entitlements.items ?? [];
    const products = (await Promise.all(items.map(this.getProducts.bind(this))))
      .filter((p): p is Product[] => p !== null)
      .flat();
    const product = products.find(p => p.id === sub.product_id);
    if (!product) {
      this.logger.warn(
        `RevenueCat subscription ${sub.id} missing product for product_id=${sub.product_id}`,
        products
      );
      return null;
    }

    return {
      identifier: product.display_name,
      isTrial: sub.status === 'trialing',
      isActive:
        sub.gives_access === true ||
        sub.status === 'active' ||
        sub.status === 'trialing',
      latestPurchaseDate: sub.starts_at ? new Date(sub.starts_at) : null,
      expirationDate: sub.current_period_ends_at
        ? new Date(sub.current_period_ends_at)
        : null,
      customerId: sub.customer_id || undefined,
      productId: product.store_identifier,
      store: sub.store ?? product.app?.type,
      willRenew: sub.auto_renewal_status === 'will_renew',
      duration: product.subscription?.duration ?? null,
    };
  }
}
