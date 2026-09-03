import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

import { Config, Lock, metrics, Mutex } from '../../base';
import { StripeFactory } from './stripe';

const DUB_CLICK_ID_PATTERN = /^[A-Za-z0-9_-]{1,255}$/;
const STRIPE_READ_OPTIONS = {
  timeout: 1000,
  maxNetworkRetries: 0,
} satisfies Stripe.RequestOptions;
const STRIPE_UPDATE_OPTIONS = {
  timeout: 1500,
  maxNetworkRetries: 0,
} satisfies Stripe.RequestOptions;

export type DubAffiliatePlan = 'pro' | 'ai' | 'team' | 'lifetime' | 'unknown';

export type DubAffiliateSkipReason =
  | 'disabled'
  | 'missing'
  | 'invalid'
  | 'legacy_promotion_code'
  | 'lock_contention'
  | 'deleted_customer'
  | 'conflict'
  | 'incomplete_metadata'
  | 'prior_billing'
  | 'ambiguous_charge_history'
  | 'stripe_error'
  | 'ambiguous_timeout';

export type DubAffiliatePrepareInput = {
  stripeCustomerId: string;
  affineUserId: string;
  dubClickId?: string;
  promotionCode?: string;
  knownSubscriptions?: readonly Stripe.Subscription[];
  plan?: DubAffiliatePlan;
};

type DubSessionMetadata = {
  dubCustomerExternalId: string;
};

export type DubAffiliatePrepareResult =
  | {
      status: 'attributed' | 'existing_owner';
      sessionMetadata: DubSessionMetadata;
    }
  | { status: 'skipped'; reason: DubAffiliateSkipReason };

type StripeOperation =
  | 'customer_retrieve'
  | 'subscriptions_list'
  | 'invoices_list'
  | 'charges_list'
  | 'customer_update';

class StripeOperationError extends Error {
  constructor(
    readonly operation: StripeOperation,
    readonly originalError: unknown
  ) {
    super(`Dub affiliate Stripe operation failed: ${operation}`);
  }
}

const prepareCounter = metrics.payment.counter('dub_affiliate_prepare_total');
const prepareDuration = metrics.payment.histogram(
  'dub_affiliate_prepare_duration_ms'
);
const stripeErrorCounter = metrics.payment.counter(
  'dub_affiliate_stripe_error_total'
);
const lockContentionCounter = metrics.payment.counter(
  'dub_affiliate_lock_contention_total'
);
const lockErrorCounter = metrics.payment.counter(
  'dub_affiliate_lock_error_total'
);

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizePromotionCode(value: string) {
  return value.trim().toLowerCase();
}

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRawNonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function stringProperty(value: unknown, property: string) {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const candidate = Reflect.get(value, property);
  return typeof candidate === 'string' ? candidate : '';
}

function isAmbiguousTimeout(error: unknown) {
  const code = stringProperty(error, 'code').toUpperCase();
  const type = stringProperty(error, 'type');
  const message = stringProperty(error, 'message');

  return (
    ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET', 'EPIPE'].includes(code) ||
    type === 'StripeConnectionError' ||
    /timed?\s*out|timeout/i.test(message)
  );
}

function outcome(result: DubAffiliatePrepareResult) {
  return result.status === 'skipped' ? result.reason : result.status;
}

@Injectable()
export class DubAffiliateService {
  constructor(
    private readonly stripeProvider: StripeFactory,
    private readonly config: Config,
    private readonly mutex: Mutex
  ) {}

  private get stripe() {
    return this.stripeProvider.stripe;
  }

  async prepareCheckout(
    input: DubAffiliatePrepareInput
  ): Promise<DubAffiliatePrepareResult> {
    const startedAt = performance.now();
    const plan = input.plan ?? 'unknown';
    const finish = (result: DubAffiliatePrepareResult) => {
      const attributes = { outcome: outcome(result), plan };
      prepareCounter.add(1, attributes);
      prepareDuration.record(performance.now() - startedAt, attributes);
      return result;
    };

    if (!this.config.payment.dubAffiliateEnabled) {
      return finish({ status: 'skipped', reason: 'disabled' });
    }

    if (!input.dubClickId) {
      return finish({ status: 'skipped', reason: 'missing' });
    }

    const dubClickId = input.dubClickId.trim();
    if (!DUB_CLICK_ID_PATTERN.test(dubClickId)) {
      return finish({ status: 'skipped', reason: 'invalid' });
    }

    const promotionCode = input.promotionCode
      ? normalizePromotionCode(input.promotionCode)
      : undefined;
    const excludedPromotionCodes = new Set(
      this.config.payment.dubAffiliateExcludedPromotionCodes
        .map(normalizePromotionCode)
        .filter(Boolean)
    );
    if (promotionCode && excludedPromotionCodes.has(promotionCode)) {
      return finish({ status: 'skipped', reason: 'legacy_promotion_code' });
    }

    let lock: Lock | undefined;
    try {
      lock = await this.mutex.tryAcquire(
        `dub-affiliate:customer:${hash(input.stripeCustomerId)}`
      );
    } catch {
      lockErrorCounter.add(1, { operation: 'acquire' });
      return finish({ status: 'skipped', reason: 'stripe_error' });
    }

    if (!lock) {
      lockContentionCounter.add(1);
      return finish({ status: 'skipped', reason: 'lock_contention' });
    }

    try {
      const subscriptionsPromise = input.knownSubscriptions
        ? Promise.resolve({ data: input.knownSubscriptions })
        : this.stripeCall('subscriptions_list', () =>
            this.stripe.subscriptions.list(
              {
                customer: input.stripeCustomerId,
                status: 'all',
                limit: 1,
              },
              STRIPE_READ_OPTIONS
            )
          );

      const [customer, subscriptions, invoices, charges] = await Promise.all([
        this.stripeCall('customer_retrieve', () =>
          this.stripe.customers.retrieve(
            input.stripeCustomerId,
            STRIPE_READ_OPTIONS
          )
        ),
        subscriptionsPromise,
        this.stripeCall('invoices_list', () =>
          this.stripe.invoices.list(
            { customer: input.stripeCustomerId, limit: 1 },
            STRIPE_READ_OPTIONS
          )
        ),
        this.stripeCall('charges_list', () =>
          this.stripe.charges.list(
            { customer: input.stripeCustomerId, limit: 10 },
            STRIPE_READ_OPTIONS
          )
        ),
      ]);

      if (customer.deleted) {
        return finish({ status: 'skipped', reason: 'deleted_customer' });
      }

      const existingExternalId = customer.metadata.dubCustomerExternalId;
      const existingClickId = customer.metadata.dubClickId;

      if (
        isNonEmpty(existingExternalId) &&
        existingExternalId !== input.affineUserId
      ) {
        return finish({ status: 'skipped', reason: 'conflict' });
      }

      if (isRawNonEmpty(existingClickId)) {
        if (isNonEmpty(existingExternalId)) {
          return finish({
            status: 'existing_owner',
            sessionMetadata: {
              dubCustomerExternalId: input.affineUserId,
            },
          });
        }

        return finish({ status: 'skipped', reason: 'incomplete_metadata' });
      }

      const hasSuccessfulCharge = charges.data.some(
        charge => charge.paid === true || charge.status === 'succeeded'
      );
      if (
        subscriptions.data.length > 0 ||
        invoices.data.length > 0 ||
        hasSuccessfulCharge
      ) {
        return finish({ status: 'skipped', reason: 'prior_billing' });
      }

      if (charges.has_more) {
        return finish({
          status: 'skipped',
          reason: 'ambiguous_charge_history',
        });
      }

      await this.stripeCall('customer_update', () =>
        this.stripe.customers.update(
          input.stripeCustomerId,
          {
            metadata: {
              dubCustomerExternalId: input.affineUserId,
              dubClickId,
            },
          },
          {
            ...STRIPE_UPDATE_OPTIONS,
            idempotencyKey: `dub-affiliate:v1:${hash(
              [input.stripeCustomerId, input.affineUserId, dubClickId].join(
                '\0'
              )
            )}`,
          }
        )
      );

      return finish({
        status: 'attributed',
        sessionMetadata: { dubCustomerExternalId: input.affineUserId },
      });
    } catch (error) {
      const stripeError =
        error instanceof StripeOperationError ? error : undefined;
      const originalError = stripeError?.originalError ?? error;
      const reason =
        stripeError?.operation === 'customer_update' &&
        isAmbiguousTimeout(originalError)
          ? 'ambiguous_timeout'
          : 'stripe_error';
      stripeErrorCounter.add(1, {
        error: reason,
        operation: stripeError?.operation ?? 'unknown',
      });
      return finish({ status: 'skipped', reason });
    } finally {
      try {
        await lock.release();
      } catch {
        // The production Lock currently swallows release failures. Keep this
        // boundary fail-open for alternate implementations and test doubles.
        lockErrorCounter.add(1, { operation: 'release' });
      }
    }
  }

  private async stripeCall<T>(
    operation: StripeOperation,
    call: () => PromiseLike<T>
  ): Promise<T> {
    try {
      return await call();
    } catch (error) {
      throw new StripeOperationError(operation, error);
    }
  }
}
