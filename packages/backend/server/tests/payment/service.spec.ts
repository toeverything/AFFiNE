import '../../src/plugins/payment';

import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';
import Stripe from 'stripe';

import { AppModule } from '../../src/app.module';
import { CurrentUser } from '../../src/core/auth';
import { AuthService } from '../../src/core/auth/service';
import {
  EarlyAccessType,
  FeatureManagementService,
} from '../../src/core/features';
import { EventEmitter } from '../../src/fundamentals';
import { Config, ConfigModule } from '../../src/fundamentals/config';
import {
  CouponType,
  encodeLookupKey,
  SubscriptionService,
} from '../../src/plugins/payment/service';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
  SubscriptionVariant,
} from '../../src/plugins/payment/types';
import { createTestingApp } from '../utils';

const test = ava as TestFn<{
  u1: CurrentUser;
  db: PrismaClient;
  app: INestApplication;
  service: SubscriptionService;
  stripe: Stripe;
  event: EventEmitter;
  feature: Sinon.SinonStubbedInstance<FeatureManagementService>;
}>;

test.beforeEach(async t => {
  const { app } = await createTestingApp({
    imports: [
      ConfigModule.forRoot({
        plugins: {
          payment: {
            stripe: {
              keys: {
                APIKey: '1',
                webhookKey: '1',
              },
            },
          },
        },
      }),
      AppModule,
    ],
    tapModule: m => {
      m.overrideProvider(FeatureManagementService).useValue(
        Sinon.createStubInstance(FeatureManagementService)
      );
    },
  });

  t.context.event = app.get(EventEmitter);
  t.context.stripe = app.get(Stripe);
  t.context.service = app.get(SubscriptionService);
  t.context.feature = app.get(FeatureManagementService);
  t.context.db = app.get(PrismaClient);
  t.context.app = app;

  t.context.u1 = await app.get(AuthService).signUp('u1@affine.pro', '1');
  await t.context.db.userStripeCustomer.create({
    data: {
      userId: t.context.u1.id,
      stripeCustomerId: 'cus_1',
    },
  });
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

const PRO_MONTHLY = `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Monthly}`;
const PRO_YEARLY = `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Yearly}`;
const PRO_LIFETIME = `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Lifetime}`;
const PRO_EA_YEARLY = `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Yearly}_${SubscriptionVariant.EA}`;
const AI_YEARLY = `${SubscriptionPlan.AI}_${SubscriptionRecurring.Yearly}`;
const AI_YEARLY_EA = `${SubscriptionPlan.AI}_${SubscriptionRecurring.Yearly}_${SubscriptionVariant.EA}`;
// prices for code redeeming
const PRO_MONTHLY_CODE = `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Monthly}_${SubscriptionVariant.Onetime}`;
const PRO_YEARLY_CODE = `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Yearly}_${SubscriptionVariant.Onetime}`;
const AI_YEARLY_CODE = `${SubscriptionPlan.AI}_${SubscriptionRecurring.Yearly}_${SubscriptionVariant.Onetime}`;

const PRICES = {
  [PRO_MONTHLY]: {
    recurring: {
      interval: 'month',
    },
    unit_amount: 799,
    currency: 'usd',
    lookup_key: PRO_MONTHLY,
  },
  [PRO_YEARLY]: {
    recurring: {
      interval: 'year',
    },
    unit_amount: 8100,
    currency: 'usd',
    lookup_key: PRO_YEARLY,
  },
  [PRO_LIFETIME]: {
    unit_amount: 49900,
    currency: 'usd',
    lookup_key: PRO_LIFETIME,
  },
  [PRO_EA_YEARLY]: {
    recurring: {
      interval: 'year',
    },
    unit_amount: 5000,
    currency: 'usd',
    lookup_key: PRO_EA_YEARLY,
  },
  [AI_YEARLY]: {
    recurring: {
      interval: 'year',
    },
    unit_amount: 10680,
    currency: 'usd',
    lookup_key: AI_YEARLY,
  },
  [AI_YEARLY_EA]: {
    recurring: {
      interval: 'year',
    },
    unit_amount: 9999,
    currency: 'usd',
    lookup_key: AI_YEARLY_EA,
  },
  [PRO_MONTHLY_CODE]: {
    unit_amount: 799,
    currency: 'usd',
    lookup_key: PRO_MONTHLY_CODE,
  },
  [PRO_YEARLY_CODE]: {
    unit_amount: 8100,
    currency: 'usd',
    lookup_key: PRO_YEARLY_CODE,
  },
  [AI_YEARLY_CODE]: {
    unit_amount: 10680,
    currency: 'usd',
    lookup_key: AI_YEARLY_CODE,
  },
};

const sub: Stripe.Subscription = {
  id: 'sub_1',
  object: 'subscription',
  cancel_at_period_end: false,
  canceled_at: null,
  current_period_end: 1745654236,
  current_period_start: 1714118236,
  customer: 'cus_1',
  items: {
    object: 'list',
    data: [
      {
        id: 'si_1',
        // @ts-expect-error stub
        price: {
          id: 'price_1',
          lookup_key: 'pro_monthly',
        },
        subscription: 'sub_1',
      },
    ],
  },
  status: 'active',
  trial_end: null,
  trial_start: null,
  schedule: null,
};

// ============== prices ==============
test('should list normal price for unauthenticated user', async t => {
  const { service, stripe } = t.context;

  // @ts-expect-error stub
  Sinon.stub(stripe.subscriptions, 'list').resolves({ data: [] });
  // @ts-expect-error stub
  Sinon.stub(stripe.prices, 'list').resolves({ data: Object.values(PRICES) });

  const prices = await service.listPrices();

  t.deepEqual(
    new Set(prices.map(p => p.lookup_key)),
    new Set([PRO_MONTHLY, PRO_YEARLY, PRO_LIFETIME, AI_YEARLY])
  );
});

test('should list normal prices for authenticated user', async t => {
  const { feature, service, u1, stripe } = t.context;

  feature.isEarlyAccessUser.withArgs(u1.id).resolves(false);
  feature.isEarlyAccessUser.withArgs(u1.id, EarlyAccessType.AI).resolves(false);

  // @ts-expect-error stub
  Sinon.stub(stripe.subscriptions, 'list').resolves({ data: [] });
  // @ts-expect-error stub
  Sinon.stub(stripe.prices, 'list').resolves({ data: Object.values(PRICES) });

  const prices = await service.listPrices(u1);

  t.deepEqual(
    new Set(prices.map(p => p.lookup_key)),
    new Set([PRO_MONTHLY, PRO_YEARLY, PRO_LIFETIME, AI_YEARLY])
  );
});

test('should list early access prices for pro ea user', async t => {
  const { feature, service, u1, stripe } = t.context;

  feature.isEarlyAccessUser.withArgs(u1.id).resolves(true);
  feature.isEarlyAccessUser.withArgs(u1.id, EarlyAccessType.AI).resolves(false);

  // @ts-expect-error stub
  Sinon.stub(stripe.subscriptions, 'list').resolves({ data: [] });
  // @ts-expect-error stub
  Sinon.stub(stripe.prices, 'list').resolves({ data: Object.values(PRICES) });

  const prices = await service.listPrices(u1);

  t.deepEqual(
    new Set(prices.map(p => p.lookup_key)),
    new Set([PRO_MONTHLY, PRO_LIFETIME, PRO_EA_YEARLY, AI_YEARLY])
  );
});

test('should list normal prices for pro ea user with old subscriptions', async t => {
  const { feature, service, u1, stripe } = t.context;

  feature.isEarlyAccessUser.withArgs(u1.id).resolves(true);
  feature.isEarlyAccessUser.withArgs(u1.id, EarlyAccessType.AI).resolves(false);

  Sinon.stub(stripe.subscriptions, 'list').resolves({
    data: [
      {
        id: 'sub_1',
        status: 'canceled',
        items: {
          data: [
            {
              // @ts-expect-error stub
              price: {
                lookup_key: PRO_YEARLY,
              },
            },
          ],
        },
      },
    ],
  });
  // @ts-expect-error stub
  Sinon.stub(stripe.prices, 'list').resolves({ data: Object.values(PRICES) });

  const prices = await service.listPrices(u1);

  t.deepEqual(
    new Set(prices.map(p => p.lookup_key)),
    new Set([PRO_MONTHLY, PRO_YEARLY, PRO_LIFETIME, AI_YEARLY])
  );
});

test('should list early access prices for ai ea user', async t => {
  const { feature, service, u1, stripe } = t.context;

  feature.isEarlyAccessUser.withArgs(u1.id).resolves(false);
  feature.isEarlyAccessUser.withArgs(u1.id, EarlyAccessType.AI).resolves(true);

  // @ts-expect-error stub
  Sinon.stub(stripe.subscriptions, 'list').resolves({ data: [] });
  // @ts-expect-error stub
  Sinon.stub(stripe.prices, 'list').resolves({ data: Object.values(PRICES) });

  const prices = await service.listPrices(u1);

  t.deepEqual(
    new Set(prices.map(p => p.lookup_key)),
    new Set([PRO_MONTHLY, PRO_YEARLY, PRO_LIFETIME, AI_YEARLY_EA])
  );
});

test('should list early access prices for pro and ai ea user', async t => {
  const { feature, service, u1, stripe } = t.context;

  feature.isEarlyAccessUser.withArgs(u1.id).resolves(true);
  feature.isEarlyAccessUser.withArgs(u1.id, EarlyAccessType.AI).resolves(true);

  // @ts-expect-error stub
  Sinon.stub(stripe.subscriptions, 'list').resolves({ data: [] });
  // @ts-expect-error stub
  Sinon.stub(stripe.prices, 'list').resolves({ data: Object.values(PRICES) });

  const prices = await service.listPrices(u1);

  t.deepEqual(
    new Set(prices.map(p => p.lookup_key)),
    new Set([PRO_MONTHLY, PRO_LIFETIME, PRO_EA_YEARLY, AI_YEARLY_EA])
  );
});

test('should list normal prices for ai ea user with old subscriptions', async t => {
  const { feature, service, u1, stripe } = t.context;

  feature.isEarlyAccessUser.withArgs(u1.id).resolves(false);
  feature.isEarlyAccessUser.withArgs(u1.id, EarlyAccessType.AI).resolves(true);

  Sinon.stub(stripe.subscriptions, 'list').resolves({
    data: [
      {
        id: 'sub_1',
        status: 'canceled',
        items: {
          data: [
            {
              // @ts-expect-error stub
              price: {
                lookup_key: AI_YEARLY,
              },
            },
          ],
        },
      },
    ],
  });
  // @ts-expect-error stub
  Sinon.stub(stripe.prices, 'list').resolves({ data: Object.values(PRICES) });

  const prices = await service.listPrices(u1);

  t.deepEqual(
    new Set(prices.map(p => p.lookup_key)),
    new Set([PRO_MONTHLY, PRO_YEARLY, PRO_LIFETIME, AI_YEARLY])
  );
});

// ============= end prices ================

// ============= checkout ==================
test('should throw if user has subscription already', async t => {
  const { service, u1, db } = t.context;

  await db.userSubscription.create({
    data: {
      userId: u1.id,
      stripeSubscriptionId: 'sub_1',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
      status: SubscriptionStatus.Active,
      start: new Date(),
      end: new Date(),
    },
  });

  await t.throwsAsync(
    () =>
      service.createCheckoutSession({
        user: u1,
        recurring: SubscriptionRecurring.Monthly,
        plan: SubscriptionPlan.Pro,
        redirectUrl: '',
        idempotencyKey: '',
      }),
    { message: 'You have already subscribed to the pro plan.' }
  );
});

test('should get correct pro plan price for checking out', async t => {
  const { service, u1, stripe, feature } = t.context;

  const customer = {
    userId: u1.id,
    email: u1.email,
    stripeCustomerId: 'cus_1',
    createdAt: new Date(),
  };

  const subListStub = Sinon.stub(stripe.subscriptions, 'list');
  // @ts-expect-error allow
  Sinon.stub(service, 'getPrice').callsFake((plan, recurring, variant) => {
    return encodeLookupKey(plan, recurring, variant);
  });
  // @ts-expect-error private member
  const getAvailablePrice = service.getAvailablePrice.bind(service);

  // non-ea user
  {
    feature.isEarlyAccessUser.resolves(false);
    // @ts-expect-error stub
    subListStub.resolves({ data: [] });
    const ret = await getAvailablePrice(
      customer,
      SubscriptionPlan.Pro,
      SubscriptionRecurring.Monthly
    );
    t.deepEqual(ret, {
      price: PRO_MONTHLY,
      coupon: undefined,
    });
  }

  // ea user, but monthly
  {
    feature.isEarlyAccessUser.resolves(true);
    // @ts-expect-error stub
    subListStub.resolves({ data: [] });
    const ret = await getAvailablePrice(
      customer,
      SubscriptionPlan.Pro,
      SubscriptionRecurring.Monthly
    );
    t.deepEqual(ret, {
      price: PRO_MONTHLY,
      coupon: undefined,
    });
  }

  // ea user, yearly
  {
    feature.isEarlyAccessUser.resolves(true);
    // @ts-expect-error stub
    subListStub.resolves({ data: [] });
    const ret = await getAvailablePrice(
      customer,
      SubscriptionPlan.Pro,
      SubscriptionRecurring.Yearly
    );
    t.deepEqual(ret, {
      price: PRO_EA_YEARLY,
      coupon: CouponType.ProEarlyAccessOneYearFree,
    });
  }

  // ea user, yearly recurring, but has old subscription
  {
    feature.isEarlyAccessUser.resolves(true);
    subListStub.resolves({
      data: [
        {
          id: 'sub_1',
          status: 'canceled',
          items: {
            data: [
              {
                // @ts-expect-error stub
                price: {
                  lookup_key: PRO_YEARLY,
                },
              },
            ],
          },
        },
      ],
    });

    const ret = await getAvailablePrice(
      customer,
      SubscriptionPlan.Pro,
      SubscriptionRecurring.Yearly
    );
    t.deepEqual(ret, {
      price: PRO_YEARLY,
      coupon: undefined,
    });
  }

  // any user, lifetime recurring
  {
    feature.isEarlyAccessUser.resolves(false);
    // @ts-expect-error stub
    subListStub.resolves({ data: [] });
    const ret = await getAvailablePrice(
      customer,
      SubscriptionPlan.Pro,
      SubscriptionRecurring.Lifetime
    );
    t.deepEqual(ret, {
      price: PRO_LIFETIME,
      coupon: undefined,
    });
  }
});

test('should get correct ai plan price for checking out', async t => {
  const { service, u1, stripe, feature } = t.context;

  const customer = {
    userId: u1.id,
    email: u1.email,
    stripeCustomerId: 'cus_1',
    createdAt: new Date(),
  };

  const subListStub = Sinon.stub(stripe.subscriptions, 'list');
  // @ts-expect-error allow
  Sinon.stub(service, 'getPrice').callsFake((plan, recurring, variant) => {
    return encodeLookupKey(plan, recurring, variant);
  });
  // @ts-expect-error private member
  const getAvailablePrice = service.getAvailablePrice.bind(service);

  // non-ea user
  {
    feature.isEarlyAccessUser.resolves(false);
    // @ts-expect-error stub
    subListStub.resolves({ data: [] });
    const ret = await getAvailablePrice(
      customer,
      SubscriptionPlan.AI,
      SubscriptionRecurring.Yearly
    );
    t.deepEqual(ret, {
      price: AI_YEARLY,
      coupon: undefined,
    });
  }

  // ea user
  {
    feature.isEarlyAccessUser.resolves(true);
    // @ts-expect-error stub
    subListStub.resolves({ data: [] });
    const ret = await getAvailablePrice(
      customer,
      SubscriptionPlan.AI,
      SubscriptionRecurring.Yearly
    );
    t.deepEqual(ret, {
      price: AI_YEARLY_EA,
      coupon: CouponType.AIEarlyAccessOneYearFree,
    });
  }

  // ea user, but has old subscription
  {
    feature.isEarlyAccessUser.resolves(true);
    subListStub.resolves({
      data: [
        {
          id: 'sub_1',
          status: 'canceled',
          items: {
            data: [
              {
                // @ts-expect-error stub
                price: {
                  lookup_key: AI_YEARLY,
                },
              },
            ],
          },
        },
      ],
    });

    const ret = await getAvailablePrice(
      customer,
      SubscriptionPlan.AI,
      SubscriptionRecurring.Yearly
    );
    t.deepEqual(ret, {
      price: AI_YEARLY,
      coupon: undefined,
    });
  }

  // pro ea user
  {
    feature.isEarlyAccessUser.withArgs(u1.id).resolves(true);
    feature.isEarlyAccessUser
      .withArgs(u1.id, EarlyAccessType.AI)
      .resolves(false);
    // @ts-expect-error stub
    subListStub.resolves({ data: [] });
    const ret = await getAvailablePrice(
      customer,
      SubscriptionPlan.AI,
      SubscriptionRecurring.Yearly
    );
    t.deepEqual(ret, {
      price: AI_YEARLY,
      coupon: CouponType.ProEarlyAccessAIOneYearFree,
    });
  }

  // pro ea user, but has old subscription
  {
    feature.isEarlyAccessUser.withArgs(u1.id).resolves(true);
    feature.isEarlyAccessUser
      .withArgs(u1.id, EarlyAccessType.AI)
      .resolves(false);
    subListStub.resolves({
      data: [
        {
          id: 'sub_1',
          status: 'canceled',
          items: {
            data: [
              {
                // @ts-expect-error stub
                price: {
                  lookup_key: AI_YEARLY,
                },
              },
            ],
          },
        },
      ],
    });

    const ret = await getAvailablePrice(
      customer,
      SubscriptionPlan.AI,
      SubscriptionRecurring.Yearly
    );
    t.deepEqual(ret, {
      price: AI_YEARLY,
      coupon: undefined,
    });
  }
});

test('should apply user coupon for checking out', async t => {
  const { service, u1, stripe } = t.context;

  const checkoutStub = Sinon.stub(stripe.checkout.sessions, 'create');
  // @ts-expect-error private member
  Sinon.stub(service, 'getAvailablePrice').resolves({
    // @ts-expect-error type inference error
    price: PRO_MONTHLY,
    coupon: undefined,
  });
  // @ts-expect-error private member
  Sinon.stub(service, 'getAvailablePromotionCode').resolves('promo_1');

  await service.createCheckoutSession({
    user: u1,
    recurring: SubscriptionRecurring.Monthly,
    plan: SubscriptionPlan.Pro,
    redirectUrl: '',
    idempotencyKey: '',
    promotionCode: 'test',
  });

  t.true(checkoutStub.calledOnce);
  const arg = checkoutStub.firstCall
    .args[0] as Stripe.Checkout.SessionCreateParams;
  t.deepEqual(arg.discounts, [{ promotion_code: 'promo_1' }]);
});

// =============== subscriptions ===============

test('should be able to create subscription', async t => {
  const { event, service, stripe, db, u1 } = t.context;

  const emitStub = Sinon.stub(event, 'emit').returns(true);
  Sinon.stub(stripe.subscriptions, 'retrieve').resolves(sub as any);
  await service.onSubscriptionChanges(sub);
  t.true(
    emitStub.calledOnceWith('user.subscription.activated', {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
    })
  );

  const subInDB = await db.userSubscription.findFirst({
    where: { userId: u1.id },
  });

  t.is(subInDB?.stripeSubscriptionId, sub.id);
});

test('should be able to update subscription', async t => {
  const { event, service, stripe, db, u1 } = t.context;

  const stub = Sinon.stub(stripe.subscriptions, 'retrieve').resolves(
    sub as any
  );
  await service.onSubscriptionChanges(sub);

  let subInDB = await db.userSubscription.findFirst({
    where: { userId: u1.id },
  });

  t.is(subInDB?.stripeSubscriptionId, sub.id);

  const emitStub = Sinon.stub(event, 'emit').returns(true);
  stub.resolves({
    ...sub,
    cancel_at_period_end: true,
    canceled_at: 1714118236,
  } as any);
  await service.onSubscriptionChanges(sub);
  t.true(
    emitStub.calledOnceWith('user.subscription.activated', {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
    })
  );

  subInDB = await db.userSubscription.findFirst({
    where: { userId: u1.id },
  });

  t.is(subInDB?.status, SubscriptionStatus.Active);
  t.is(subInDB?.canceledAt?.getTime(), 1714118236000);
});

test('should be able to delete subscription', async t => {
  const { event, service, stripe, db, u1 } = t.context;

  const stub = Sinon.stub(stripe.subscriptions, 'retrieve').resolves(
    sub as any
  );
  await service.onSubscriptionChanges(sub);

  let subInDB = await db.userSubscription.findFirst({
    where: { userId: u1.id },
  });

  t.is(subInDB?.stripeSubscriptionId, sub.id);

  const emitStub = Sinon.stub(event, 'emit').returns(true);
  stub.resolves({ ...sub, status: 'canceled' } as any);
  await service.onSubscriptionChanges(sub);
  t.true(
    emitStub.calledOnceWith('user.subscription.canceled', {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
    })
  );

  subInDB = await db.userSubscription.findFirst({
    where: { userId: u1.id },
  });

  t.is(subInDB, null);
});

test('should be able to cancel subscription', async t => {
  const { event, service, db, u1, stripe } = t.context;

  await db.userSubscription.create({
    data: {
      userId: u1.id,
      stripeSubscriptionId: 'sub_1',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Yearly,
      status: SubscriptionStatus.Active,
      start: new Date(),
      end: new Date(),
    },
  });

  const stub = Sinon.stub(stripe.subscriptions, 'update').resolves({
    ...sub,
    cancel_at_period_end: true,
    canceled_at: 1714118236,
  } as any);

  const emitStub = Sinon.stub(event, 'emit').returns(true);
  const subInDB = await service.cancelSubscription(
    '',
    u1.id,
    SubscriptionPlan.Pro
  );
  // we will cancel the subscription at the end of the period
  // so in cancel event, we still emit the activated event
  t.true(
    emitStub.calledOnceWith('user.subscription.activated', {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
    })
  );

  t.true(stub.calledOnceWith('sub_1', { cancel_at_period_end: true }));
  t.is(subInDB.status, SubscriptionStatus.Active);
  t.truthy(subInDB.canceledAt);
});

test('should be able to resume subscription', async t => {
  const { event, service, db, u1, stripe } = t.context;

  await db.userSubscription.create({
    data: {
      userId: u1.id,
      stripeSubscriptionId: 'sub_1',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Yearly,
      status: SubscriptionStatus.Active,
      start: new Date(),
      end: new Date(Date.now() + 100000),
      canceledAt: new Date(),
    },
  });

  const stub = Sinon.stub(stripe.subscriptions, 'update').resolves(sub as any);

  const emitStub = Sinon.stub(event, 'emit').returns(true);
  const subInDB = await service.resumeCanceledSubscription(
    '',
    u1.id,
    SubscriptionPlan.Pro
  );
  t.true(
    emitStub.calledOnceWith('user.subscription.activated', {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
    })
  );

  t.true(stub.calledOnceWith('sub_1', { cancel_at_period_end: false }));
  t.is(subInDB.status, SubscriptionStatus.Active);
  t.falsy(subInDB.canceledAt);
});

const subscriptionSchedule: Stripe.SubscriptionSchedule = {
  id: 'sub_sched_1',
  customer: 'cus_1',
  subscription: 'sub_1',
  status: 'active',
  phases: [
    {
      items: [
        // @ts-expect-error mock
        {
          price: PRO_MONTHLY,
        },
      ],
      start_date: 1714118236,
      end_date: 1745654236,
    },
  ],
};

test('should be able to update recurring', async t => {
  const { service, db, u1, stripe } = t.context;

  await db.userSubscription.create({
    data: {
      userId: u1.id,
      stripeSubscriptionId: 'sub_1',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
      status: SubscriptionStatus.Active,
      start: new Date(),
      end: new Date(Date.now() + 100000),
    },
  });

  // 1. turn a subscription into a subscription schedule
  // 2. update the schedule
  //   2.1 update the current phase with  an end date
  //   2.2 add a new phase with a start date

  // @ts-expect-error private member
  Sinon.stub(service, 'getPrice').resolves(PRO_YEARLY);
  Sinon.stub(stripe.subscriptions, 'retrieve').resolves(sub as any);
  Sinon.stub(stripe.subscriptionSchedules, 'create').resolves(
    subscriptionSchedule as any
  );
  const stub = Sinon.stub(stripe.subscriptionSchedules, 'update');

  await service.updateSubscriptionRecurring(
    '',
    u1.id,
    SubscriptionPlan.Pro,
    SubscriptionRecurring.Yearly
  );

  t.true(stub.calledOnce);
  const arg = stub.firstCall.args;
  t.is(arg[0], subscriptionSchedule.id);
  t.deepEqual(arg[1], {
    phases: [
      {
        items: [
          {
            price: PRO_MONTHLY,
          },
        ],
        start_date: 1714118236,
        end_date: 1745654236,
      },
      {
        items: [
          {
            price: PRO_YEARLY,
          },
        ],
      },
    ],
  });
});

test('should release the schedule if the new recurring is the same as the current phase', async t => {
  const { service, db, u1, stripe } = t.context;

  await db.userSubscription.create({
    data: {
      userId: u1.id,
      stripeSubscriptionId: 'sub_1',
      stripeScheduleId: 'sub_sched_1',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Yearly,
      status: SubscriptionStatus.Active,
      start: new Date(),
      end: new Date(Date.now() + 100000),
    },
  });

  // @ts-expect-error private member
  Sinon.stub(service, 'getPrice').resolves(PRO_MONTHLY);
  Sinon.stub(stripe.subscriptions, 'retrieve').resolves({
    ...sub,
    schedule: subscriptionSchedule,
  } as any);
  Sinon.stub(stripe.subscriptionSchedules, 'retrieve').resolves(
    subscriptionSchedule as any
  );
  const stub = Sinon.stub(stripe.subscriptionSchedules, 'release');

  await service.updateSubscriptionRecurring(
    '',
    u1.id,
    SubscriptionPlan.Pro,
    SubscriptionRecurring.Monthly
  );

  t.true(stub.calledOnce);
  t.is(stub.firstCall.args[0], subscriptionSchedule.id);
});

test('should operate with latest subscription status', async t => {
  const { service, stripe } = t.context;

  Sinon.stub(stripe.subscriptions, 'retrieve').resolves(sub as any);
  // @ts-expect-error private member
  const stub = Sinon.stub(service, 'saveSubscription');

  // latest state come first
  await service.onSubscriptionChanges(sub);
  // old state come later
  await service.onSubscriptionChanges({
    ...sub,
    status: 'canceled',
  });

  t.is(stub.callCount, 2);
  t.deepEqual(stub.firstCall.args[1], sub);
  t.deepEqual(stub.secondCall.args[1], sub);
});

// ============== Lifetime Subscription ===============
const lifetimeInvoice: Stripe.Invoice = {
  id: 'in_1',
  object: 'invoice',
  amount_paid: 49900,
  total: 49900,
  customer: 'cus_1',
  currency: 'usd',
  status: 'paid',
  lines: {
    data: [
      {
        // @ts-expect-error stub
        price: PRICES[PRO_LIFETIME],
      },
    ],
  },
};

const onetimeMonthlyInvoice: Stripe.Invoice = {
  id: 'in_2',
  object: 'invoice',
  amount_paid: 799,
  total: 799,
  customer: 'cus_1',
  currency: 'usd',
  status: 'paid',
  lines: {
    data: [
      {
        // @ts-expect-error stub
        price: PRICES[PRO_MONTHLY_CODE],
      },
    ],
  },
};

const onetimeYearlyInvoice: Stripe.Invoice = {
  id: 'in_3',
  object: 'invoice',
  amount_paid: 8100,
  total: 8100,
  customer: 'cus_1',
  currency: 'usd',
  status: 'paid',
  lines: {
    data: [
      {
        // @ts-expect-error stub
        price: PRICES[PRO_YEARLY_CODE],
      },
    ],
  },
};

test('should not be able to checkout for lifetime recurring if not enabled', async t => {
  const { service, stripe, u1 } = t.context;

  Sinon.stub(stripe.subscriptions, 'list').resolves({ data: [] } as any);
  await t.throwsAsync(
    () =>
      service.createCheckoutSession({
        user: u1,
        plan: SubscriptionPlan.Pro,
        recurring: SubscriptionRecurring.Lifetime,
        redirectUrl: '',
        idempotencyKey: '',
      }),
    { message: 'You are not allowed to perform this action.' }
  );
});

test('should be able to checkout for lifetime recurring', async t => {
  const { service, stripe, u1, app } = t.context;
  const config = app.get(Config);
  await config.runtime.set('plugins.payment/showLifetimePrice', true);

  Sinon.stub(stripe.subscriptions, 'list').resolves({ data: [] } as any);
  Sinon.stub(stripe.prices, 'list').resolves({
    data: [PRICES[PRO_LIFETIME]],
  } as any);
  const sessionStub = Sinon.stub(stripe.checkout.sessions, 'create');

  await service.createCheckoutSession({
    user: u1,
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Lifetime,
    redirectUrl: '',
    idempotencyKey: '',
  });

  t.true(sessionStub.calledOnce);
});

test('should not be able to checkout for lifetime recurring if already subscribed', async t => {
  const { service, u1, db } = t.context;

  await db.userSubscription.create({
    data: {
      userId: u1.id,
      stripeSubscriptionId: null,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Lifetime,
      status: SubscriptionStatus.Active,
      start: new Date(),
    },
  });

  await t.throwsAsync(
    () =>
      service.createCheckoutSession({
        user: u1,
        recurring: SubscriptionRecurring.Lifetime,
        plan: SubscriptionPlan.Pro,
        redirectUrl: '',
        idempotencyKey: '',
      }),
    { message: 'You have already subscribed to the pro plan.' }
  );

  await db.userSubscription.updateMany({
    where: { userId: u1.id },
    data: {
      stripeSubscriptionId: null,
      recurring: SubscriptionRecurring.Monthly,
      variant: SubscriptionVariant.Onetime,
      end: new Date(Date.now() + 100000),
    },
  });

  await t.throwsAsync(
    () =>
      service.createCheckoutSession({
        user: u1,
        recurring: SubscriptionRecurring.Lifetime,
        plan: SubscriptionPlan.Pro,
        redirectUrl: '',
        idempotencyKey: '',
      }),
    { message: 'You have already subscribed to the pro plan.' }
  );
});

test('should be able to subscribe to lifetime recurring', async t => {
  // lifetime payment isn't a subscription, so we need to trigger the creation by invoice payment event
  const { service, stripe, db, u1, event } = t.context;

  const emitStub = Sinon.stub(event, 'emit');
  Sinon.stub(stripe.invoices, 'retrieve').resolves(lifetimeInvoice as any);
  await service.saveInvoice(lifetimeInvoice, 'invoice.payment_succeeded');

  const subInDB = await db.userSubscription.findFirst({
    where: { userId: u1.id },
  });

  t.true(
    emitStub.calledOnceWith('user.subscription.activated', {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Lifetime,
    })
  );
  t.is(subInDB?.plan, SubscriptionPlan.Pro);
  t.is(subInDB?.recurring, SubscriptionRecurring.Lifetime);
  t.is(subInDB?.status, SubscriptionStatus.Active);
  t.is(subInDB?.stripeSubscriptionId, null);
});

test('should be able to subscribe to lifetime recurring with old subscription', async t => {
  const { service, stripe, db, u1, event } = t.context;

  await db.userSubscription.create({
    data: {
      userId: u1.id,
      stripeSubscriptionId: 'sub_1',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
      status: SubscriptionStatus.Active,
      start: new Date(),
      end: new Date(),
    },
  });

  const emitStub = Sinon.stub(event, 'emit');
  Sinon.stub(stripe.invoices, 'retrieve').resolves(lifetimeInvoice as any);
  Sinon.stub(stripe.subscriptions, 'cancel').resolves(sub as any);
  await service.saveInvoice(lifetimeInvoice, 'invoice.payment_succeeded');

  const subInDB = await db.userSubscription.findFirst({
    where: { userId: u1.id },
  });

  t.true(
    emitStub.calledOnceWith('user.subscription.activated', {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Lifetime,
    })
  );
  t.is(subInDB?.plan, SubscriptionPlan.Pro);
  t.is(subInDB?.recurring, SubscriptionRecurring.Lifetime);
  t.is(subInDB?.status, SubscriptionStatus.Active);
  t.is(subInDB?.stripeSubscriptionId, null);
});

test('should not be able to update lifetime recurring', async t => {
  const { service, db, u1 } = t.context;

  await db.userSubscription.create({
    data: {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Lifetime,
      status: SubscriptionStatus.Active,
      start: new Date(),
      end: new Date(),
    },
  });

  await t.throwsAsync(
    () => service.cancelSubscription('', u1.id, SubscriptionPlan.Pro),
    { message: 'Onetime payment subscription cannot be canceled.' }
  );

  await t.throwsAsync(
    () =>
      service.updateSubscriptionRecurring(
        '',
        u1.id,
        SubscriptionPlan.Pro,
        SubscriptionRecurring.Monthly
      ),
    { message: 'You cannot update an onetime payment subscription.' }
  );

  await t.throwsAsync(
    () => service.resumeCanceledSubscription('', u1.id, SubscriptionPlan.Pro),
    { message: 'Onetime payment subscription cannot be resumed.' }
  );
});

// ============== Onetime Subscription ===============
test('should be able to checkout for onetime payment', async t => {
  const { service, u1, stripe } = t.context;

  const checkoutStub = Sinon.stub(stripe.checkout.sessions, 'create');
  // @ts-expect-error private member
  Sinon.stub(service, 'getAvailablePrice').resolves({
    // @ts-expect-error type inference error
    price: PRO_MONTHLY_CODE,
    coupon: undefined,
  });

  await service.createCheckoutSession({
    user: u1,
    recurring: SubscriptionRecurring.Monthly,
    plan: SubscriptionPlan.Pro,
    variant: SubscriptionVariant.Onetime,
    redirectUrl: '',
    idempotencyKey: '',
  });

  t.true(checkoutStub.calledOnce);
  const arg = checkoutStub.firstCall
    .args[0] as Stripe.Checkout.SessionCreateParams;
  t.is(arg.mode, 'payment');
  t.is(arg.line_items?.[0].price, PRO_MONTHLY_CODE);
});

test('should be able to checkout onetime payment if previous subscription is onetime', async t => {
  const { service, u1, stripe, db } = t.context;

  await db.userSubscription.create({
    data: {
      userId: u1.id,
      stripeSubscriptionId: 'sub_1',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
      variant: SubscriptionVariant.Onetime,
      status: SubscriptionStatus.Active,
      start: new Date(),
      end: new Date(),
    },
  });

  const checkoutStub = Sinon.stub(stripe.checkout.sessions, 'create');
  // @ts-expect-error private member
  Sinon.stub(service, 'getAvailablePrice').resolves({
    // @ts-expect-error type inference error
    price: PRO_MONTHLY_CODE,
    coupon: undefined,
  });

  await service.createCheckoutSession({
    user: u1,
    recurring: SubscriptionRecurring.Monthly,
    plan: SubscriptionPlan.Pro,
    variant: SubscriptionVariant.Onetime,
    redirectUrl: '',
    idempotencyKey: '',
  });

  t.true(checkoutStub.calledOnce);
  const arg = checkoutStub.firstCall
    .args[0] as Stripe.Checkout.SessionCreateParams;
  t.is(arg.mode, 'payment');
  t.is(arg.line_items?.[0].price, PRO_MONTHLY_CODE);
});

test('should not be able to checkout out onetime payment if previous subscription is not onetime', async t => {
  const { service, u1, db } = t.context;

  await db.userSubscription.create({
    data: {
      userId: u1.id,
      stripeSubscriptionId: 'sub_1',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
      status: SubscriptionStatus.Active,
      start: new Date(),
      end: new Date(),
    },
  });

  await t.throwsAsync(
    () =>
      service.createCheckoutSession({
        user: u1,
        recurring: SubscriptionRecurring.Monthly,
        plan: SubscriptionPlan.Pro,
        variant: SubscriptionVariant.Onetime,
        redirectUrl: '',
        idempotencyKey: '',
      }),
    { message: 'You have already subscribed to the pro plan.' }
  );

  await db.userSubscription.updateMany({
    where: { userId: u1.id },
    data: {
      stripeSubscriptionId: null,
      recurring: SubscriptionRecurring.Lifetime,
    },
  });

  await t.throwsAsync(
    () =>
      service.createCheckoutSession({
        user: u1,
        recurring: SubscriptionRecurring.Monthly,
        plan: SubscriptionPlan.Pro,
        variant: SubscriptionVariant.Onetime,
        redirectUrl: '',
        idempotencyKey: '',
      }),
    { message: 'You have already subscribed to the pro plan.' }
  );
});

test('should be able to subscribe onetime payment subscription', async t => {
  const { service, stripe, db, u1, event } = t.context;

  const emitStub = Sinon.stub(event, 'emit');
  Sinon.stub(stripe.invoices, 'retrieve').resolves(
    onetimeMonthlyInvoice as any
  );
  await service.saveInvoice(onetimeMonthlyInvoice, 'invoice.payment_succeeded');

  const subInDB = await db.userSubscription.findFirst({
    where: { userId: u1.id },
  });

  t.true(
    emitStub.calledOnceWith('user.subscription.activated', {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
    })
  );
  t.is(subInDB?.plan, SubscriptionPlan.Pro);
  t.is(subInDB?.recurring, SubscriptionRecurring.Monthly);
  t.is(subInDB?.status, SubscriptionStatus.Active);
  t.is(subInDB?.stripeSubscriptionId, null);
  t.is(
    subInDB?.end?.toDateString(),
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toDateString()
  );
});

test('should be able to recalculate onetime payment subscription period', async t => {
  const { service, stripe, db, u1 } = t.context;

  const stub = Sinon.stub(stripe.invoices, 'retrieve').resolves(
    onetimeMonthlyInvoice as any
  );
  await service.saveInvoice(onetimeMonthlyInvoice, 'invoice.payment_succeeded');

  let subInDB = await db.userSubscription.findFirst({
    where: { userId: u1.id },
  });

  t.truthy(subInDB);

  let end = subInDB!.end!;
  await service.saveInvoice(onetimeMonthlyInvoice, 'invoice.payment_succeeded');
  subInDB = await db.userSubscription.findFirst({
    where: { userId: u1.id },
  });

  // add 30 days
  t.is(subInDB!.end!.getTime(), end.getTime() + 30 * 24 * 60 * 60 * 1000);

  end = subInDB!.end!;
  stub.resolves(onetimeYearlyInvoice as any);
  await service.saveInvoice(onetimeYearlyInvoice, 'invoice.payment_succeeded');
  subInDB = await db.userSubscription.findFirst({
    where: { userId: u1.id },
  });

  // add 365 days
  t.is(subInDB!.end!.getTime(), end.getTime() + 365 * 24 * 60 * 60 * 1000);

  // make subscription expired
  await db.userSubscription.update({
    where: { id: subInDB!.id },
    data: {
      end: new Date(Date.now() - 1000),
    },
  });
  await service.saveInvoice(onetimeYearlyInvoice, 'invoice.payment_succeeded');
  subInDB = await db.userSubscription.findFirst({
    where: { userId: u1.id },
  });

  // add 365 days from now
  t.is(
    subInDB?.end?.toDateString(),
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toDateString()
  );
});
