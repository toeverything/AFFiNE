import { FactoryProvider, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

import { Config, Mutex, OnEvent } from '../../base';
import { ServerFeature, ServerService } from '../../core';
import {
  decodeLookupKey,
  DEFAULT_PRICES,
  SubscriptionRecurring,
  SubscriptionVariant,
} from './types';

@Injectable()
export class StripeFactory {
  #stripe!: Stripe;
  readonly #logger = new Logger(StripeFactory.name);

  constructor(
    private readonly config: Config,
    private readonly mutex: Mutex,
    private readonly server: ServerService
  ) {}

  get stripe() {
    return this.#stripe;
  }

  @OnEvent('config.init')
  async onConfigInit() {
    this.setup();
    await this.initStripeProducts();
  }

  @OnEvent('config.changed')
  async onConfigChanged(event: Events['config.changed']) {
    if ('payment' in event.updates) {
      this.setup();
    }
  }

  setup() {
    // Prefer new keys under payment.stripe.*, fallback to legacy root keys for backward compatibility
    const {
      apiKey: nestedApiKey,
      webhookKey: _,
      ...config
    } = this.config.payment.stripe || {};
    // NOTE:
    //   we always fake a key if not set because `new Stripe` will complain if it's empty string
    //   this will make code cleaner than providing `Stripe` instance as optional one.
    const apiKey =
      nestedApiKey || this.config.payment.apiKey || 'stripe-api-key';

    // TODO@(@darkskygit): use per-requests api key injection
    this.#stripe = new Stripe(apiKey, config);
    if (this.config.payment.enabled) {
      this.server.enableFeature(ServerFeature.Payment);
    } else {
      this.server.disableFeature(ServerFeature.Payment);
    }
  }

  private async initStripeProducts() {
    // only init stripe products in dev mode or canary deployment
    if (!this.config.payment.enabled && !env.namespaces.canary) {
      return;
    }

    await using lock = await this.mutex.acquire('init stripe prices');

    if (!lock) {
      return;
    }

    const keys = new Set<string>();
    try {
      await this.stripe.prices
        .list({
          active: true,
          limit: 100,
        })
        .autoPagingEach(item => {
          if (item.lookup_key) {
            keys.add(item.lookup_key);
          }
        });
    } catch {
      this.#logger.warn('Failed to list stripe prices, skip auto init.');
      return;
    }

    for (const [key, setting] of DEFAULT_PRICES) {
      if (keys.has(key)) {
        continue;
      }

      const lookupKey = decodeLookupKey(key);

      try {
        await this.stripe.prices.create({
          product_data: {
            name: setting.product,
          },
          billing_scheme: 'per_unit',
          unit_amount: setting.price,
          currency: 'usd',
          lookup_key: key,
          tax_behavior: 'inclusive',
          recurring:
            lookupKey.recurring === SubscriptionRecurring.Lifetime ||
            lookupKey.variant === SubscriptionVariant.Onetime
              ? undefined
              : {
                  interval:
                    lookupKey.recurring === SubscriptionRecurring.Monthly
                      ? 'month'
                      : 'year',
                  interval_count: 1,
                  usage_type: 'licensed',
                },
        });
      } catch (e) {
        this.#logger.error('Failed to create stripe price.', e);
      }
    }
  }
}

export const StripeProvider: FactoryProvider = {
  provide: Stripe,
  useFactory: (provider: StripeFactory) => {
    return provider.stripe;
  },
  inject: [StripeFactory],
};
