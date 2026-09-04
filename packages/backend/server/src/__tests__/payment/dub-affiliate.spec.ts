import test from 'ava';
import Sinon from 'sinon';
import Stripe from 'stripe';

import { Config, Lock, metrics, Mutex } from '../../base';
import {
  type DubAffiliatePrepareInput,
  DubAffiliateService,
} from '../../plugins/payment/dub-affiliate';
import { StripeFactory } from '../../plugins/payment/stripe';

type StripeStubs = {
  customers: {
    retrieve: Sinon.SinonStub;
    update: Sinon.SinonStub;
  };
  subscriptions: { list: Sinon.SinonStub };
  invoices: { list: Sinon.SinonStub };
  charges: { list: Sinon.SinonStub };
};

type Harness = {
  config: Config;
  stripe: StripeStubs;
  mutex: { tryAcquire: Sinon.SinonStub };
  service: DubAffiliateService;
  releases: () => number;
};

const input: DubAffiliatePrepareInput = {
  stripeCustomerId: 'cus_test',
  affineUserId: 'user_test',
  dubClickId: 'click_123-ABC',
  plan: 'pro',
};

const emptyList = <T>(data: readonly T[] = [], hasMore = false) => ({
  object: 'list' as const,
  data: [...data],
  has_more: hasMore,
  url: '/v1/test',
});

function createHarness(options?: {
  enabled?: boolean;
  excludedPromotionCodes?: string[];
  customer?: Record<string, unknown>;
  subscriptions?: readonly unknown[];
  invoices?: readonly unknown[];
  charges?: readonly unknown[];
  chargesHasMore?: boolean;
}): Harness {
  let releaseCount = 0;
  const stripe: StripeStubs = {
    customers: {
      retrieve: Sinon.stub().resolves(
        options?.customer ?? {
          id: input.stripeCustomerId,
          deleted: false,
          metadata: {},
        }
      ),
      update: Sinon.stub().resolves({
        id: input.stripeCustomerId,
        deleted: false,
        metadata: {},
      }),
    },
    subscriptions: {
      list: Sinon.stub().resolves(emptyList(options?.subscriptions ?? [])),
    },
    invoices: {
      list: Sinon.stub().resolves(emptyList(options?.invoices ?? [])),
    },
    charges: {
      list: Sinon.stub().resolves(
        emptyList(options?.charges ?? [], options?.chargesHasMore)
      ),
    },
  };
  const mutex = {
    tryAcquire: Sinon.stub().resolves(
      new Lock(async () => {
        releaseCount += 1;
      })
    ),
  };
  const config = {
    payment: {
      dubAffiliateEnabled: options?.enabled ?? true,
      dubAffiliateExcludedPromotionCodes: options?.excludedPromotionCodes ?? [],
    },
  } as Config;

  return {
    config,
    stripe,
    mutex,
    service: new DubAffiliateService(
      { stripe } as unknown as StripeFactory,
      config,
      mutex as unknown as Mutex
    ),
    releases: () => releaseCount,
  };
}

function totalStripeCalls(stripe: StripeStubs) {
  return (
    stripe.customers.retrieve.callCount +
    stripe.customers.update.callCount +
    stripe.subscriptions.list.callCount +
    stripe.invoices.list.callCount +
    stripe.charges.list.callCount
  );
}

test.afterEach.always(() => {
  Sinon.restore();
});

test('skips before locking or Stripe calls when disabled', async t => {
  const h = createHarness({ enabled: false });

  t.deepEqual(await h.service.prepareCheckout(input), {
    status: 'skipped',
    reason: 'disabled',
  });
  t.is(h.mutex.tryAcquire.callCount, 0);
  t.is(totalStripeCalls(h.stripe), 0);
});

for (const [name, dubClickId, reason] of [
  ['missing', undefined, 'missing'],
  ['invalid', 'contains spaces', 'invalid'],
  ['too long', 'a'.repeat(256), 'invalid'],
] as const) {
  test(`skips ${name} click id before locking or Stripe calls`, async t => {
    const h = createHarness();

    t.deepEqual(await h.service.prepareCheckout({ ...input, dubClickId }), {
      status: 'skipped',
      reason,
    });
    t.is(h.mutex.tryAcquire.callCount, 0);
    t.is(totalStripeCalls(h.stripe), 0);
  });
}

test('records prepare duration only after a lock attempt', async t => {
  const record = Sinon.stub(
    metrics.payment.histogram('dub_affiliate_prepare_duration_ms'),
    'record'
  );

  const disabled = createHarness({ enabled: false });
  await disabled.service.prepareCheckout(input);
  const missing = createHarness();
  await missing.service.prepareCheckout({ ...input, dubClickId: undefined });
  const invalid = createHarness();
  await invalid.service.prepareCheckout({ ...input, dubClickId: 'bad id' });
  const legacy = createHarness({ excludedPromotionCodes: ['legacy'] });
  await legacy.service.prepareCheckout({ ...input, promotionCode: 'legacy' });
  t.is(record.callCount, 0);

  const contended = createHarness();
  contended.mutex.tryAcquire.resolves(undefined);
  await contended.service.prepareCheckout(input);
  t.is(record.callCount, 1);
  t.like(record.lastCall.args[1], { outcome: 'lock_contention', plan: 'pro' });

  const errored = createHarness();
  errored.mutex.tryAcquire.rejects(new Error('redis unavailable'));
  await errored.service.prepareCheckout(input);
  t.is(record.callCount, 2);
  t.like(record.lastCall.args[1], { outcome: 'lock_error', plan: 'pro' });

  const attributed = createHarness();
  await attributed.service.prepareCheckout(input);
  t.is(record.callCount, 3);
  t.like(record.lastCall.args[1], { outcome: 'attributed', plan: 'pro' });
});

test('skips normalized excluded promotion code before lock and Stripe', async t => {
  const h = createHarness({ excludedPromotionCodes: ['  Legacy-Code  '] });

  t.deepEqual(
    await h.service.prepareCheckout({
      ...input,
      promotionCode: ' LEGACY-code ',
    }),
    { status: 'skipped', reason: 'legacy_promotion_code' }
  );
  t.is(h.mutex.tryAcquire.callCount, 0);
  t.is(totalStripeCalls(h.stripe), 0);
});

test('attributes an eligible customer with bounded Stripe requests', async t => {
  const h = createHarness();

  t.deepEqual(await h.service.prepareCheckout(input), {
    status: 'attributed',
    sessionMetadata: { dubCustomerExternalId: input.affineUserId },
  });

  t.deepEqual(h.stripe.customers.retrieve.firstCall.args, [
    input.stripeCustomerId,
    { timeout: 1000, maxNetworkRetries: 0 },
  ]);
  t.deepEqual(h.stripe.subscriptions.list.firstCall.args, [
    { customer: input.stripeCustomerId, status: 'all', limit: 1 },
    { timeout: 1000, maxNetworkRetries: 0 },
  ]);
  t.deepEqual(h.stripe.invoices.list.firstCall.args, [
    { customer: input.stripeCustomerId, limit: 1 },
    { timeout: 1000, maxNetworkRetries: 0 },
  ]);
  t.deepEqual(h.stripe.charges.list.firstCall.args, [
    { customer: input.stripeCustomerId, limit: 10 },
    { timeout: 1000, maxNetworkRetries: 0 },
  ]);
  t.deepEqual(
    h.stripe.customers.update.firstCall.args[0],
    input.stripeCustomerId
  );
  t.deepEqual(h.stripe.customers.update.firstCall.args[1], {
    metadata: {
      dubCustomerExternalId: input.affineUserId,
      dubClickId: input.dubClickId,
    },
  });
  t.deepEqual(h.stripe.customers.update.firstCall.args[2], {
    timeout: 1500,
    maxNetworkRetries: 0,
    idempotencyKey: h.stripe.customers.update.firstCall.args[2].idempotencyKey,
  });
  t.regex(
    h.stripe.customers.update.firstCall.args[2].idempotencyKey,
    /^dub-affiliate:v1:[a-f0-9]{64}$/
  );
  t.is(h.releases(), 1);
});

test('uses a hashed customer lock key without exposing identifiers', async t => {
  const h = createHarness();

  await h.service.prepareCheckout(input);

  const key = h.mutex.tryAcquire.firstCall.args[0] as string;
  t.regex(key, /^dub-affiliate:customer:[a-f0-9]{64}$/);
  t.false(key.includes(input.stripeCustomerId));
  t.false(key.includes(input.affineUserId));
  t.false(key.includes(input.dubClickId!));
});

test('keeps an existing click for the matching owner', async t => {
  const h = createHarness({
    customer: {
      id: input.stripeCustomerId,
      deleted: false,
      metadata: {
        dubCustomerExternalId: input.affineUserId,
        dubClickId: 'first_click',
      },
    },
  });

  t.deepEqual(
    await h.service.prepareCheckout({ ...input, dubClickId: 'second_click' }),
    {
      status: 'existing_owner',
      sessionMetadata: { dubCustomerExternalId: input.affineUserId },
    }
  );
  t.is(h.stripe.customers.update.callCount, 0);
  t.is(h.releases(), 1);
});

test('fails open on conflicting ownership without overwriting metadata', async t => {
  const h = createHarness({
    customer: {
      id: input.stripeCustomerId,
      deleted: false,
      metadata: {
        dubCustomerExternalId: 'different_user',
        dubClickId: 'first_click',
      },
    },
  });

  t.deepEqual(await h.service.prepareCheckout(input), {
    status: 'skipped',
    reason: 'conflict',
  });
  t.is(h.stripe.customers.update.callCount, 0);
  t.is(h.releases(), 1);
});

test('treats non-empty malformed ownership metadata as a conflict', async t => {
  const h = createHarness({
    customer: {
      id: input.stripeCustomerId,
      deleted: false,
      metadata: {
        dubCustomerExternalId: ` ${input.affineUserId} `,
        dubClickId: 'first_click',
      },
    },
  });

  t.deepEqual(await h.service.prepareCheckout(input), {
    status: 'skipped',
    reason: 'conflict',
  });
  t.is(h.stripe.customers.update.callCount, 0);
  t.is(h.releases(), 1);
});

test('does not replace a whitespace-only existing external owner', async t => {
  const h = createHarness({
    customer: {
      id: input.stripeCustomerId,
      deleted: false,
      metadata: { dubCustomerExternalId: '   ' },
    },
  });

  t.deepEqual(await h.service.prepareCheckout(input), {
    status: 'skipped',
    reason: 'conflict',
  });
  t.is(h.stripe.customers.update.callCount, 0);
  t.is(h.releases(), 1);
});

test('fails open for an existing click with missing ownership metadata', async t => {
  const h = createHarness({
    customer: {
      id: input.stripeCustomerId,
      deleted: false,
      metadata: { dubClickId: 'first_click' },
    },
  });

  t.deepEqual(await h.service.prepareCheckout(input), {
    status: 'skipped',
    reason: 'incomplete_metadata',
  });
  t.is(h.stripe.customers.update.callCount, 0);
  t.is(h.releases(), 1);
});

for (const existingClickId of ['   ', 'invalid click value']) {
  test(`does not overwrite existing malformed click metadata: ${JSON.stringify(existingClickId)}`, async t => {
    const h = createHarness({
      customer: {
        id: input.stripeCustomerId,
        deleted: false,
        metadata: { dubClickId: existingClickId },
      },
    });

    t.deepEqual(await h.service.prepareCheckout(input), {
      status: 'skipped',
      reason: 'incomplete_metadata',
    });
    t.is(h.stripe.customers.update.callCount, 0);
    t.is(h.releases(), 1);
  });
}

for (const [name, options] of [
  ['subscription', { subscriptions: [{ id: 'sub_1' }] }],
  ['invoice', { invoices: [{ id: 'in_1' }] }],
  ['succeeded charge', { charges: [{ id: 'ch_1', status: 'succeeded' }] }],
  [
    'paid and refunded charge',
    { charges: [{ id: 'ch_1', paid: true, refunded: true }] },
  ],
  [
    'paid and uncaptured charge',
    { charges: [{ id: 'ch_1', paid: true, captured: false }] },
  ],
] as const) {
  test(`rejects prior billing from ${name}`, async t => {
    const h = createHarness(options);

    t.deepEqual(await h.service.prepareCheckout(input), {
      status: 'skipped',
      reason: 'prior_billing',
    });
    t.is(h.stripe.customers.update.callCount, 0);
    t.is(h.releases(), 1);
  });
}

test('allows only failed or pending charges when history is complete', async t => {
  const h = createHarness({
    charges: [
      { id: 'ch_failed', paid: false, status: 'failed' },
      { id: 'ch_pending', paid: false, status: 'pending' },
    ],
  });

  t.is((await h.service.prepareCheckout(input)).status, 'attributed');
  t.is(h.stripe.customers.update.callCount, 1);
});

test('fails closed when incomplete charge history has no visible success', async t => {
  const h = createHarness({
    charges: [{ id: 'ch_failed', paid: false, status: 'failed' }],
    chargesHasMore: true,
  });

  t.deepEqual(await h.service.prepareCheckout(input), {
    status: 'skipped',
    reason: 'ambiguous_charge_history',
  });
  t.is(h.stripe.customers.update.callCount, 0);
});

test('skips a deleted customer', async t => {
  const h = createHarness({
    customer: { id: input.stripeCustomerId, deleted: true },
  });

  t.deepEqual(await h.service.prepareCheckout(input), {
    status: 'skipped',
    reason: 'deleted_customer',
  });
  t.is(h.stripe.customers.update.callCount, 0);
  t.is(h.releases(), 1);
});

test('reuses known subscriptions without listing them again', async t => {
  const h = createHarness();

  t.deepEqual(
    await h.service.prepareCheckout({ ...input, knownSubscriptions: [] }),
    {
      status: 'attributed',
      sessionMetadata: { dubCustomerExternalId: input.affineUserId },
    }
  );
  t.is(h.stripe.subscriptions.list.callCount, 0);
  t.is(h.stripe.customers.update.callCount, 1);
});

test('known subscriptions still trigger prior billing without a list call', async t => {
  const h = createHarness();

  t.deepEqual(
    await h.service.prepareCheckout({
      ...input,
      knownSubscriptions: [{ id: 'sub_known' } as Stripe.Subscription],
    }),
    { status: 'skipped', reason: 'prior_billing' }
  );
  t.is(h.stripe.subscriptions.list.callCount, 0);
  t.is(h.stripe.customers.update.callCount, 0);
});

test('lock contention fails open without Stripe calls', async t => {
  const h = createHarness();
  h.mutex.tryAcquire.resolves(undefined);

  t.deepEqual(await h.service.prepareCheckout(input), {
    status: 'skipped',
    reason: 'lock_contention',
  });
  t.is(h.mutex.tryAcquire.callCount, 1);
  t.is(totalStripeCalls(h.stripe), 0);
});

test('lock errors fail open without Stripe calls', async t => {
  const h = createHarness();
  h.mutex.tryAcquire.rejects(new Error('redis unavailable'));

  t.deepEqual(await h.service.prepareCheckout(input), {
    status: 'skipped',
    reason: 'lock_error',
  });
  t.is(h.mutex.tryAcquire.callCount, 1);
  t.is(h.releases(), 0);
  t.is(totalStripeCalls(h.stripe), 0);
});

for (const operation of [
  'retrieve',
  'subscriptions',
  'invoices',
  'charges',
  'update',
] as const) {
  test(`${operation} Stripe errors fail open and release the lock`, async t => {
    const h = createHarness();
    const stub =
      operation === 'retrieve'
        ? h.stripe.customers.retrieve
        : operation === 'subscriptions'
          ? h.stripe.subscriptions.list
          : operation === 'invoices'
            ? h.stripe.invoices.list
            : operation === 'charges'
              ? h.stripe.charges.list
              : h.stripe.customers.update;
    stub.rejects(new Error('stripe unavailable'));

    t.deepEqual(await h.service.prepareCheckout(input), {
      status: 'skipped',
      reason: 'stripe_error',
    });
    t.is(h.releases(), 1);
  });
}

test('Stripe timeouts fail open as ambiguous without an unhandled rejection', async t => {
  const h = createHarness();
  h.stripe.customers.update.rejects(
    Object.assign(new Error('Request timed out'), { code: 'ETIMEDOUT' })
  );

  t.deepEqual(await h.service.prepareCheckout(input), {
    status: 'skipped',
    reason: 'ambiguous_timeout',
  });
  t.is(h.releases(), 1);
});

test('read timeouts fail open as ordinary Stripe errors', async t => {
  const h = createHarness();
  h.stripe.customers.retrieve.rejects(
    Object.assign(new Error('Request timed out'), { code: 'ETIMEDOUT' })
  );

  t.deepEqual(await h.service.prepareCheckout(input), {
    status: 'skipped',
    reason: 'stripe_error',
  });
  t.is(h.releases(), 1);
});

test('uses a stable idempotency key for the same attribution input', async t => {
  const first = createHarness();
  const second = createHarness();

  await first.service.prepareCheckout(input);
  await second.service.prepareCheckout(input);

  t.is(
    first.stripe.customers.update.firstCall.args[2].idempotencyKey,
    second.stripe.customers.update.firstCall.args[2].idempotencyKey
  );
});

test('concurrent clicks update at most once and do not overwrite the owner', async t => {
  let locked = false;
  let releaseFirstUpdate!: () => void;
  let signalFirstUpdate!: () => void;
  const firstUpdateStarted = new Promise<void>(resolve => {
    signalFirstUpdate = resolve;
  });
  const permitFirstUpdate = new Promise<void>(resolve => {
    releaseFirstUpdate = resolve;
  });
  const customer = {
    id: input.stripeCustomerId,
    deleted: false,
    metadata: {} as Record<string, string>,
  };
  const h = createHarness({ customer });
  h.mutex.tryAcquire.callsFake(async () => {
    if (locked) return undefined;
    locked = true;
    return new Lock(async () => {
      locked = false;
    });
  });
  h.stripe.customers.retrieve.callsFake(async () => ({
    ...customer,
    metadata: { ...customer.metadata },
  }));
  h.stripe.customers.update.callsFake(async (_id, params) => {
    signalFirstUpdate();
    await permitFirstUpdate;
    customer.metadata = { ...params.metadata };
    return customer;
  });

  const first = h.service.prepareCheckout({
    ...input,
    dubClickId: 'click_one',
  });
  await firstUpdateStarted;
  const second = await h.service.prepareCheckout({
    ...input,
    dubClickId: 'click_two',
  });
  releaseFirstUpdate();

  t.deepEqual(second, { status: 'skipped', reason: 'lock_contention' });
  t.is((await first).status, 'attributed');
  t.is(h.stripe.customers.update.callCount, 1);
  t.deepEqual(customer.metadata, {
    dubCustomerExternalId: input.affineUserId,
    dubClickId: 'click_one',
  });
});
