import '../../plugins/payment';

import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';
import Stripe from 'stripe';

import { AppModule } from '../../app.module';
import { EventBus } from '../../base';
import { ConfigFactory, ConfigModule } from '../../base/config';
import { CurrentUser } from '../../core/auth';
import { AuthService } from '../../core/auth/service';
import { EntitlementService } from '../../core/entitlement';
import { SubscriptionCronJobs } from '../../plugins/payment/cron';
import { SelfhostTeamSubscriptionManager } from '../../plugins/payment/manager';
import { RevenueCatService } from '../../plugins/payment/revenuecat';
import { SubscriptionService } from '../../plugins/payment/service';
import { StripeFactory } from '../../plugins/payment/stripe';
import {
  encodeLookupKey,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '../../plugins/payment/types';
import { createTestingApp, type TestingApp } from '../utils';

const unixNow = () => {
  return Math.floor(Date.now() / 1000);
};

const PRO_MONTHLY = `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Monthly}`;
const PRO_YEARLY = `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Yearly}`;
const PRO_LIFETIME = `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Lifetime}`;
const AI_YEARLY = `${SubscriptionPlan.AI}_${SubscriptionRecurring.Yearly}`;
const TEAM_MONTHLY = `${SubscriptionPlan.Team}_${SubscriptionRecurring.Monthly}`;
const TEAM_YEARLY = `${SubscriptionPlan.Team}_${SubscriptionRecurring.Yearly}`;
const NORMAL_USER_PRICES = [
  PRO_MONTHLY,
  PRO_YEARLY,
  PRO_LIFETIME,
  AI_YEARLY,
  TEAM_MONTHLY,
  TEAM_YEARLY,
];

const NORMAL_USER_PRICES_WITHOUT_LIFETIME = [
  PRO_MONTHLY,
  PRO_YEARLY,
  AI_YEARLY,
  TEAM_MONTHLY,
  TEAM_YEARLY,
];

const PRICES = {
  [PRO_MONTHLY]: {
    recurring: {
      interval: 'month',
    },
    unit_amount: 799,
    currency: 'usd',
    id: PRO_MONTHLY,
    lookup_key: PRO_MONTHLY,
  },
  [PRO_YEARLY]: {
    recurring: {
      interval: 'year',
    },
    unit_amount: 8100,
    currency: 'usd',
    id: PRO_YEARLY,
    lookup_key: PRO_YEARLY,
  },
  [PRO_LIFETIME]: {
    unit_amount: 49900,
    currency: 'usd',
    id: PRO_LIFETIME,
    lookup_key: PRO_LIFETIME,
  },
  [AI_YEARLY]: {
    recurring: {
      interval: 'year',
    },
    unit_amount: 10680,
    currency: 'usd',
    id: AI_YEARLY,
    lookup_key: AI_YEARLY,
  },
  [TEAM_MONTHLY]: {
    unit_amount: 1500,
    currency: 'usd',
    id: TEAM_MONTHLY,
    lookup_key: TEAM_MONTHLY,
  },
  [TEAM_YEARLY]: {
    unit_amount: 14400,
    currency: 'usd',
    id: TEAM_YEARLY,
    lookup_key: TEAM_YEARLY,
  },
} as any as Record<string, Stripe.Price>;

const sub: Stripe.Subscription = {
  id: 'sub_1',
  object: 'subscription',
  cancel_at_period_end: false,
  canceled_at: null,
  current_period_end: unixNow() + 60 * 60 * 24 * 30,
  current_period_start: unixNow() - 60 * 60 * 24 * 1,
  // @ts-expect-error stub
  customer: {
    id: 'cus_1',
    email: 'u1@affine.pro',
  },
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
  metadata: {},
};

const test = ava as TestFn<{
  u1: CurrentUser;
  db: PrismaClient;
  app: TestingApp;
  service: SubscriptionService;
  event: Sinon.SinonStubbedInstance<EventBus>;
  revenueCat: Sinon.SinonStubbedInstance<RevenueCatService>;
  stripe: {
    customers: Sinon.SinonStubbedInstance<Stripe.CustomersResource>;
    prices: Sinon.SinonStubbedInstance<Stripe.PricesResource>;
    subscriptions: Sinon.SinonStubbedInstance<Stripe.SubscriptionsResource>;
    subscriptionSchedules: Sinon.SinonStubbedInstance<Stripe.SubscriptionSchedulesResource>;
    checkout: {
      sessions: Sinon.SinonStubbedInstance<Stripe.Checkout.SessionsResource>;
    };
    invoices: Sinon.SinonStubbedInstance<Stripe.InvoicesResource>;
    promotionCodes: Sinon.SinonStubbedInstance<Stripe.PromotionCodesResource>;
  };
}>;

function getLastCheckoutPrice(checkoutStub: Sinon.SinonStub) {
  const call = checkoutStub.getCall(checkoutStub.callCount - 1);
  const arg = call.args[0] as Stripe.Checkout.SessionCreateParams;
  return {
    price: arg.line_items?.[0]?.price,
    coupon: arg.discounts?.[0]?.coupon,
  };
}

function getLastCheckoutParams(checkoutStub: Sinon.SinonStub) {
  const call = checkoutStub.getCall(checkoutStub.callCount - 1);
  return call.args[0] as Stripe.Checkout.SessionCreateParams;
}

test.before(async t => {
  const app = await createTestingApp({
    imports: [
      ConfigModule.override({
        payment: {
          enabled: true,
          showLifetimePrice: true,
          stripe: {
            apiKey: '1',
            webhookKey: '1',
          },
        },
      }),
      AppModule,
    ],
    tapModule: m => {
      m.overrideProvider(EventBus).useValue(Sinon.createStubInstance(EventBus));
    },
  });

  t.context.event = app.get(EventBus);
  t.context.service = app.get(SubscriptionService);
  t.context.revenueCat = Sinon.stub(app.get(RevenueCatService));
  t.context.db = app.get(PrismaClient);
  t.context.app = app;

  const stripeFactory = app.get(StripeFactory);
  await stripeFactory.onConfigInit();

  const stripe = stripeFactory.stripe;
  const stripeStubs = {
    customers: Sinon.stub(stripe.customers),
    prices: Sinon.stub(stripe.prices),
    subscriptions: Sinon.stub(stripe.subscriptions),
    subscriptionSchedules: Sinon.stub(stripe.subscriptionSchedules),
    invoices: Sinon.stub(stripe.invoices),
    checkout: {
      sessions: Sinon.stub(stripe.checkout.sessions),
    },
    promotionCodes: Sinon.stub(stripe.promotionCodes),
  };

  t.context.stripe = stripeStubs;
});

test.beforeEach(async t => {
  const { db, app, stripe } = t.context;
  await t.context.app.initTestingDB();
  t.context.u1 = await app.get(AuthService).signUp('u1@affine.pro', '1');

  app.get(ConfigFactory).override({
    payment: {
      showLifetimePrice: true,
      revenuecat: {
        enabled: false,
      },
    },
  });

  await db.workspace.create({
    data: {
      id: 'ws_1',
      accessPolicy: { create: {} },
    },
  });
  await db.userStripeCustomer.create({
    data: {
      userId: t.context.u1.id,
      stripeCustomerId: 'cus_1',
    },
  });

  Sinon.reset();

  // @ts-expect-error stub
  stripe.prices.list.callsFake((params: Stripe.PriceListParams) => {
    if (params.lookup_keys) {
      return Promise.resolve({
        data: params.lookup_keys.map(lk => PRICES[lk]),
      });
    }

    return Promise.resolve({ data: Object.values(PRICES) });
  });

  // @ts-expect-error stub
  stripe.subscriptions.list.resolves({ data: [] });
  // @ts-expect-error stub
  stripe.checkout.sessions.create.resolves({ id: 'cs_1' });
});

test.after.always(async t => {
  await t.context.app.close();
});

// ============== prices ==============
test('should list normal price for unauthenticated user', async t => {
  const { service } = t.context;

  const prices = await service.listPrices();

  t.deepEqual(
    prices.map(p => encodeLookupKey(p.lookupKey)),
    NORMAL_USER_PRICES
  );
});

test('should list normal prices for authenticated user', async t => {
  const { service, u1 } = t.context;

  const prices = await service.listPrices(u1);

  t.deepEqual(
    prices.map(p => encodeLookupKey(p.lookupKey)),
    NORMAL_USER_PRICES
  );
});

test('should not show lifetime price if not enabled', async t => {
  const { service, app } = t.context;

  app.get(ConfigFactory).override({
    payment: {
      showLifetimePrice: false,
    },
  });

  const prices = await service.listPrices(t.context.u1);

  t.deepEqual(
    prices.map(p => encodeLookupKey(p.lookupKey)),
    NORMAL_USER_PRICES_WITHOUT_LIFETIME
  );
});

test('should list normal prices for user with old pro subscriptions', async t => {
  const { service, u1, stripe } = t.context;

  stripe.subscriptions.list.resolves({
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

  const prices = await service.listPrices(u1);

  t.deepEqual(
    prices.map(p => encodeLookupKey(p.lookupKey)),
    NORMAL_USER_PRICES
  );
});

test('should list normal prices for user with old ai subscriptions', async t => {
  const { service, u1, stripe } = t.context;

  stripe.subscriptions.list.resolves({
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

  const prices = await service.listPrices(u1);

  t.deepEqual(
    prices.map(p => encodeLookupKey(p.lookupKey)),
    NORMAL_USER_PRICES
  );
});

// ============= end prices ================

// ============= checkout ==================
test('should throw if user has subscription already', async t => {
  const { service, u1, db } = t.context;

  await db.providerSubscription.create({
    data: {
      provider: 'stripe',
      targetType: 'user',
      targetId: u1.id,
      externalSubscriptionId: 'sub_1',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
      status: SubscriptionStatus.Active,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 100000),
    },
  });

  await t.throwsAsync(
    () =>
      service.checkout(
        {
          plan: SubscriptionPlan.Pro,
          recurring: SubscriptionRecurring.Monthly,
          successCallbackLink: '',
        },
        { user: u1 }
      ),
    { message: 'You have already subscribed to the pro plan.' }
  );
});

test('should allow checkout after local subscription period ended', async t => {
  const { service, u1, db, stripe } = t.context;

  await db.providerSubscription.create({
    data: {
      provider: 'stripe',
      targetType: 'user',
      targetId: u1.id,
      externalSubscriptionId: 'sub_expired_ai',
      plan: SubscriptionPlan.AI,
      recurring: SubscriptionRecurring.Yearly,
      status: SubscriptionStatus.Active,
      periodStart: new Date('2026-05-04T13:11:45.000Z'),
      periodEnd: new Date('2026-05-11T13:11:45.000Z'),
    },
  });

  await service.checkout(
    {
      plan: SubscriptionPlan.AI,
      recurring: SubscriptionRecurring.Yearly,
      successCallbackLink: '',
    },
    { user: u1 }
  );

  t.true(stripe.checkout.sessions.create.calledOnce);
  t.deepEqual(getLastCheckoutPrice(stripe.checkout.sessions.create), {
    price: AI_YEARLY,
    coupon: undefined,
  });
});

test('should reject checkout when stripe already has current subscription', async t => {
  const { service, u1, stripe } = t.context;

  stripe.subscriptions.list.resolves({
    data: [
      {
        ...sub,
        id: 'sub_pending_webhook',
        status: SubscriptionStatus.Active,
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

  await t.throwsAsync(
    () =>
      service.checkout(
        {
          plan: SubscriptionPlan.Pro,
          recurring: SubscriptionRecurring.Yearly,
          successCallbackLink: '',
        },
        { user: u1 }
      ),
    { message: 'You have already subscribed to the pro plan.' }
  );

  t.false(stripe.checkout.sessions.create.called);
});

test('should reject checkout when revenuecat already has active subscription', async t => {
  const { app, revenueCat, service, u1, stripe } = t.context;

  app.get(ConfigFactory).override({
    payment: {
      revenuecat: {
        enabled: true,
      },
    },
  });

  revenueCat.getSubscriptions.resolves([
    {
      identifier: 'Pro',
      isTrial: false,
      isActive: true,
      latestPurchaseDate: new Date(),
      expirationDate: new Date(Date.now() + 100000),
      customerId: 'rc_customer',
      productId: 'app.affine.pro.Annual',
      store: 'app_store',
      willRenew: true,
      duration: 'P1Y',
    },
  ]);

  await t.throwsAsync(
    () =>
      service.checkout(
        {
          plan: SubscriptionPlan.Pro,
          recurring: SubscriptionRecurring.Yearly,
          successCallbackLink: '',
        },
        { user: u1 }
      ),
    {
      message:
        'This subscription is managed by App Store or Google Play. Please manage it in the corresponding store.',
    }
  );

  t.false(stripe.checkout.sessions.create.called);
});

test('should get correct pro plan price for checking out', async t => {
  const { app, service, u1, stripe } = t.context;
  // monthly
  {
    await service.checkout(
      {
        plan: SubscriptionPlan.Pro,
        recurring: SubscriptionRecurring.Monthly,
        successCallbackLink: '',
      },
      { user: u1 }
    );

    t.deepEqual(getLastCheckoutPrice(stripe.checkout.sessions.create), {
      price: PRO_MONTHLY,
      coupon: undefined,
    });
  }

  // yearly
  {
    await service.checkout(
      {
        plan: SubscriptionPlan.Pro,
        recurring: SubscriptionRecurring.Yearly,
        successCallbackLink: '',
      },
      { user: u1 }
    );

    t.deepEqual(getLastCheckoutPrice(stripe.checkout.sessions.create), {
      price: PRO_YEARLY,
      coupon: undefined,
    });
  }

  // yearly recurring, but has old subscription
  {
    stripe.subscriptions.list.resolves({
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

    await service.checkout(
      {
        plan: SubscriptionPlan.Pro,
        recurring: SubscriptionRecurring.Yearly,
        successCallbackLink: '',
      },
      { user: u1 }
    );

    t.deepEqual(getLastCheckoutPrice(stripe.checkout.sessions.create), {
      price: PRO_YEARLY,
      coupon: undefined,
    });
  }

  // any user, lifetime recurring
  {
    app.get(ConfigFactory).override({
      payment: {
        showLifetimePrice: true,
      },
    });

    await service.checkout(
      {
        plan: SubscriptionPlan.Pro,
        recurring: SubscriptionRecurring.Lifetime,
        successCallbackLink: '',
      },
      { user: u1 }
    );

    t.deepEqual(getLastCheckoutPrice(stripe.checkout.sessions.create), {
      price: PRO_LIFETIME,
      coupon: undefined,
    });
  }
});

test('should get correct ai plan price for checking out', async t => {
  const { service, u1, stripe } = t.context;

  // user
  {
    await service.checkout(
      {
        plan: SubscriptionPlan.AI,
        recurring: SubscriptionRecurring.Yearly,
        successCallbackLink: '',
      },
      { user: u1 }
    );

    t.deepEqual(getLastCheckoutPrice(stripe.checkout.sessions.create), {
      price: AI_YEARLY,
      coupon: undefined,
    });
    t.is(
      getLastCheckoutParams(stripe.checkout.sessions.create).subscription_data
        ?.trial_period_days,
      7
    );
  }

  // user with recorded trial usage
  {
    await service.checkout(
      {
        plan: SubscriptionPlan.AI,
        recurring: SubscriptionRecurring.Yearly,
        successCallbackLink: '',
      },
      { user: u1 }
    );

    t.deepEqual(getLastCheckoutPrice(stripe.checkout.sessions.create), {
      price: AI_YEARLY,
      coupon: undefined,
    });
    t.is(
      getLastCheckoutParams(stripe.checkout.sessions.create).subscription_data
        ?.trial_period_days,
      undefined
    );
  }
});

test('should record AI trial usage when checkout grants trial', async t => {
  const { db, service, u1 } = t.context;

  await service.checkout(
    {
      plan: SubscriptionPlan.AI,
      recurring: SubscriptionRecurring.Yearly,
      successCallbackLink: '',
    },
    { user: u1 }
  );

  const usage = await db.subscriptionTrialUsage.findUnique({
    where: {
      targetType_targetId_plan: {
        targetType: 'user',
        targetId: u1.id,
        plan: SubscriptionPlan.AI,
      },
    },
  });
  t.is(usage?.externalRef, 'cs_1');
});

test('should apply user coupon for checking out', async t => {
  const { service, u1, stripe } = t.context;

  stripe.promotionCodes.list.resolves({
    data: [
      {
        // @ts-expect-error mock
        coupon: {
          id: 'coupon_1',
        },
      },
    ],
  });

  await service.checkout(
    {
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
      successCallbackLink: '',
      coupon: 'test',
    },
    { user: u1 }
  );

  t.deepEqual(getLastCheckoutPrice(stripe.checkout.sessions.create), {
    price: PRO_MONTHLY,
    coupon: 'coupon_1',
  });
});

// =============== subscriptions ===============
test('should be able to create subscription', async t => {
  const { event, service, db, u1 } = t.context;

  await service.saveStripeSubscription(sub);

  t.true(
    event.emit.calledOnceWith('user.subscription.activated', {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
    })
  );
  const providerFact = await db.providerSubscription.findUnique({
    where: {
      provider_externalSubscriptionId: {
        provider: 'stripe',
        externalSubscriptionId: sub.id,
      },
    },
  });
  t.like(providerFact, {
    targetType: 'user',
    targetId: u1.id,
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Monthly,
    status: SubscriptionStatus.Active,
  });
});

test('should be able to update subscription', async t => {
  const { event, service, db, u1 } = t.context;
  await service.saveStripeSubscription(sub);

  const canceledAt = unixNow();

  await service.saveStripeSubscription({
    ...sub,
    cancel_at_period_end: true,
    canceled_at: canceledAt,
  });

  t.true(
    event.emit.calledWith('user.subscription.activated', {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
    })
  );

  const subInDB = await db.providerSubscription.findUnique({
    where: {
      provider_externalSubscriptionId: {
        provider: 'stripe',
        externalSubscriptionId: sub.id,
      },
    },
  });

  t.is(subInDB?.status, SubscriptionStatus.Active);
  t.is(subInDB?.canceledAt?.getTime(), canceledAt * 1000);
});

test('should preserve old provider fact when stripe creates a new subscription for the same plan', async t => {
  const { service, db, u1 } = t.context;

  await db.providerSubscription.create({
    data: {
      provider: 'stripe',
      targetType: 'user',
      targetId: u1.id,
      externalSubscriptionId: 'sub_old',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Yearly,
      status: SubscriptionStatus.Canceled,
      periodStart: new Date('2026-03-26T08:23:57.000Z'),
      periodEnd: new Date('2027-03-26T08:23:57.000Z'),
    },
  });

  await service.saveStripeSubscription({
    ...sub,
    id: 'sub_new',
    status: SubscriptionStatus.Active,
    items: {
      ...sub.items,
      data: [
        {
          ...sub.items.data[0],
          // @ts-expect-error stub
          price: {
            lookup_key: PRO_YEARLY,
          },
        },
      ],
    },
  });

  const subscriptions = await db.providerSubscription.findMany({
    where: {
      provider: 'stripe',
      targetType: 'user',
      targetId: u1.id,
      plan: SubscriptionPlan.Pro,
    },
    orderBy: { externalSubscriptionId: 'asc' },
  });

  t.is(subscriptions.length, 2);
  t.is(subscriptions[0].externalSubscriptionId, 'sub_new');
  t.is(subscriptions[0].status, SubscriptionStatus.Active);
  t.is(subscriptions[1].externalSubscriptionId, 'sub_old');
  t.is(subscriptions[1].status, SubscriptionStatus.Canceled);
});

test('should be able to delete subscription', async t => {
  const { event, service, db, u1 } = t.context;
  await service.saveStripeSubscription(sub);

  await service.saveStripeSubscription({
    ...sub,
    status: 'canceled',
  });

  t.true(
    event.emit.calledWith('user.subscription.canceled', {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
    })
  );

  t.like(
    await db.providerSubscription.findUnique({
      where: {
        provider_externalSubscriptionId: {
          provider: 'stripe',
          externalSubscriptionId: sub.id,
        },
      },
    }),
    {
      status: SubscriptionStatus.Canceled,
    }
  );
});

test('should be able to cancel subscription', async t => {
  const { service, db, u1, stripe } = t.context;

  await db.providerSubscription.create({
    data: {
      provider: 'stripe',
      targetType: 'user',
      targetId: u1.id,
      externalSubscriptionId: 'sub_1',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Yearly,
      status: SubscriptionStatus.Active,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 100000),
      metadata: { preserved: true },
    },
  });

  stripe.subscriptions.update.resolves({
    ...sub,
    cancel_at_period_end: true,
    canceled_at: unixNow(),
  } as any);

  const subInDB = await service.cancelSubscription({
    userId: u1.id,
    plan: SubscriptionPlan.Pro,
  });

  t.true(
    stripe.subscriptions.update.calledOnceWith('sub_1', {
      cancel_at_period_end: true,
    })
  );
  t.is(subInDB.status, SubscriptionStatus.Active);
  t.truthy(subInDB.canceledAt);
  const saved = await db.providerSubscription.findUniqueOrThrow({
    where: {
      provider_externalSubscriptionId: {
        provider: 'stripe',
        externalSubscriptionId: 'sub_1',
      },
    },
  });
  t.like(saved.metadata, { preserved: true, nextBillAt: null });
});

test('should reconcile canceled stripe subscriptions and revoke local entitlement', async t => {
  const { app, db, event, service, stripe, u1 } = t.context;
  const cron = app.get(SubscriptionCronJobs);

  await service.saveStripeSubscription(sub);
  event.emit.resetHistory();

  stripe.subscriptions.retrieve.resolves({
    ...sub,
    status: SubscriptionStatus.Canceled,
  } as any);

  await cron.reconcileStripeSubscriptions();

  const subInDB = await db.providerSubscription.findUnique({
    where: {
      provider_externalSubscriptionId: {
        provider: 'stripe',
        externalSubscriptionId: sub.id,
      },
    },
  });

  t.is(subInDB?.status, SubscriptionStatus.Canceled);
  t.true(
    event.emit.calledWith('user.subscription.canceled', {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
    })
  );
});

test('should be able to resume subscription', async t => {
  const { service, db, u1, stripe } = t.context;

  await db.providerSubscription.create({
    data: {
      provider: 'stripe',
      targetType: 'user',
      targetId: u1.id,
      externalSubscriptionId: 'sub_1',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Yearly,
      status: SubscriptionStatus.Active,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 100000),
      canceledAt: new Date(),
    },
  });

  stripe.subscriptions.update.resolves(sub as any);

  const subInDB = await service.resumeSubscription({
    userId: u1.id,
    plan: SubscriptionPlan.Pro,
  });

  t.true(
    stripe.subscriptions.update.calledOnceWith('sub_1', {
      cancel_at_period_end: false,
    })
  );
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
          quantity: 1,
        },
      ],
      start_date: unixNow(),
      end_date: unixNow() + 30 * 24 * 60 * 60,
    },
    {
      items: [
        // @ts-expect-error mock
        {
          price: PRO_YEARLY,
          quantity: 1,
        },
      ],
      start_date: unixNow() + 30 * 24 * 60 * 60,
    },
  ],
};

test('should be able to update recurring', async t => {
  const { service, db, u1, stripe } = t.context;

  await db.providerSubscription.create({
    data: {
      provider: 'stripe',
      targetType: 'user',
      targetId: u1.id,
      externalSubscriptionId: 'sub_1',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
      status: SubscriptionStatus.Active,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 100000),
    },
  });

  // 1. turn a subscription into a subscription schedule
  // 2. update the current phase with an end date
  stripe.subscriptions.retrieve.resolves(sub as any);
  stripe.subscriptionSchedules.create.resolves(subscriptionSchedule as any);
  stripe.subscriptionSchedules.update.resolves(subscriptionSchedule as any);

  await service.updateSubscriptionRecurring(
    {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
    },
    SubscriptionRecurring.Yearly
  );

  t.true(
    stripe.subscriptionSchedules.update.calledOnceWith(
      subscriptionSchedule.id,
      {
        phases: [
          {
            items: [
              {
                price: PRO_MONTHLY,
                quantity: 1,
              },
            ],
            start_date: subscriptionSchedule.phases[0].start_date,
            end_date: subscriptionSchedule.phases[0].end_date,
          },
          {
            items: [
              {
                price: PRO_YEARLY,
                quantity: 1,
              },
            ],
          },
        ],
      }
    )
  );
});

test('should release the schedule if the new recurring is the same as the current phase', async t => {
  const { service, db, u1, stripe } = t.context;

  await db.providerSubscription.create({
    data: {
      provider: 'stripe',
      targetType: 'user',
      targetId: u1.id,
      externalSubscriptionId: 'sub_1',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Yearly,
      status: SubscriptionStatus.Active,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 100000),
      metadata: { stripeScheduleId: 'sub_sched_1' },
    },
  });

  stripe.subscriptions.retrieve.resolves({
    ...sub,
    schedule: subscriptionSchedule.id,
  } as any);
  stripe.subscriptionSchedules.retrieve.resolves(subscriptionSchedule as any);

  const subInDB = await service.updateSubscriptionRecurring(
    {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
    },
    SubscriptionRecurring.Monthly
  );

  t.true(
    stripe.subscriptionSchedules.release.calledOnceWith(subscriptionSchedule.id)
  );

  t.is(subInDB.recurring, SubscriptionRecurring.Monthly);
});

test('should be able to cancel subscription with schedule', async t => {
  const { service, u1, stripe } = t.context;

  await service.saveStripeSubscription({
    ...sub,
    schedule: 'sub_sched_1',
  });

  stripe.subscriptionSchedules.retrieve.resolves(subscriptionSchedule as any);

  const subInDB = await service.cancelSubscription({
    userId: u1.id,
    plan: SubscriptionPlan.Pro,
  });

  t.true(
    stripe.subscriptionSchedules.update.calledOnceWith(
      subscriptionSchedule.id,
      {
        phases: [
          {
            items: [
              {
                price: PRO_MONTHLY,
                quantity: 1,
              },
            ],
            coupon: undefined,
            start_date: subscriptionSchedule.phases[0].start_date,
            end_date: subscriptionSchedule.phases[0].end_date,
            metadata: {
              next_coupon: null,
              next_price: PRO_YEARLY,
            },
          },
        ],
        end_behavior: 'cancel',
      }
    )
  );

  t.is(subInDB.status, SubscriptionStatus.Active);
  t.truthy(subInDB.canceledAt);
  t.falsy(subInDB.nextBillAt);
});

test('should be able to resume subscription with schedule', async t => {
  const { service, u1, stripe } = t.context;

  await service.saveStripeSubscription({
    ...sub,
    canceled_at: unixNow(),
    schedule: 'sub_sched_1',
  });

  stripe.subscriptionSchedules.retrieve.resolves({
    ...subscriptionSchedule,
    phases: [
      {
        items: [
          // @ts-expect-error mock
          {
            price: PRO_MONTHLY,
            quantity: 1,
          },
        ],
        start_date: subscriptionSchedule.phases[0].start_date,
        end_date: subscriptionSchedule.phases[0].end_date,
        metadata: {
          next_price: PRO_YEARLY,
        },
      },
    ],
    end_behavior: 'cancel',
  });

  const subInDB = await service.resumeSubscription({
    userId: u1.id,
    plan: SubscriptionPlan.Pro,
  });

  t.true(
    stripe.subscriptionSchedules.update.calledOnceWith(
      subscriptionSchedule.id,
      {
        phases: [
          {
            items: [{ price: PRO_MONTHLY, quantity: 1 }],
            start_date: subscriptionSchedule.phases[0].start_date,
            end_date: subscriptionSchedule.phases[0].end_date,
            metadata: {
              next_price: null,
              next_coupon: null,
            },
          },
          {
            items: [{ price: PRO_YEARLY, quantity: 1 }],
            coupon: undefined,
          },
        ],
        end_behavior: 'release',
      }
    )
  );

  t.is(subInDB.status, SubscriptionStatus.Active);
  t.falsy(subInDB.canceledAt);
  t.truthy(subInDB.nextBillAt);
});

// ============== Lifetime Subscription ===============
const lifetimeInvoice: Stripe.Invoice = {
  id: 'in_1',
  object: 'invoice',
  amount_paid: 49900,
  total: 49900,
  customer: 'cus_1',
  customer_email: 'u1@affine.pro',
  currency: 'usd',
  status: 'paid',
  lines: {
    data: [
      // @ts-expect-error stub
      {
        price: PRICES[PRO_LIFETIME],
      },
    ],
  },
};

test('should not be able to checkout for lifetime recurring if not enabled', async t => {
  const { service, u1, app } = t.context;
  app.get(ConfigFactory).override({
    payment: {
      showLifetimePrice: false,
    },
  });

  await t.throwsAsync(
    () =>
      service.checkout(
        {
          plan: SubscriptionPlan.Pro,
          recurring: SubscriptionRecurring.Lifetime,
          variant: null,
          successCallbackLink: '',
        },
        {
          user: u1,
        }
      ),
    { message: 'You are trying to access a unknown subscription plan.' }
  );
});

test('should be able to checkout for lifetime recurring', async t => {
  const { service, u1, stripe, app } = t.context;

  app.get(ConfigFactory).override({
    payment: {
      showLifetimePrice: true,
    },
  });

  await service.checkout(
    {
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Lifetime,
      variant: null,
      successCallbackLink: '',
    },
    {
      user: u1,
    }
  );

  t.deepEqual(getLastCheckoutPrice(stripe.checkout.sessions.create), {
    price: PRO_LIFETIME,
    coupon: undefined,
  });
});

test('should not be able to checkout for lifetime recurring if already subscribed', async t => {
  const { service, u1, db } = t.context;

  await db.providerSubscription.create({
    data: {
      provider: 'stripe',
      targetType: 'user',
      targetId: u1.id,
      externalSubscriptionId: 'stripe_invoice:existing_lifetime',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Lifetime,
      status: SubscriptionStatus.Active,
      periodStart: new Date(),
    },
  });

  await t.throwsAsync(
    () =>
      service.checkout(
        {
          plan: SubscriptionPlan.Pro,
          recurring: SubscriptionRecurring.Lifetime,
          variant: null,
          successCallbackLink: '',
        },
        {
          user: u1,
        }
      ),
    { message: 'You have already subscribed to the pro plan.' }
  );
});

test('should be able to subscribe to lifetime recurring', async t => {
  // lifetime payment isn't a subscription, so we need to trigger the creation by invoice payment event
  const { service, db, u1, event } = t.context;

  await service.saveStripeInvoice(lifetimeInvoice);

  const subInDB = await db.providerSubscription.findFirst({
    where: {
      provider: 'stripe',
      targetType: 'user',
      targetId: u1.id,
      recurring: SubscriptionRecurring.Lifetime,
    },
  });

  t.true(
    event.emit.calledOnceWith('user.subscription.activated', {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Lifetime,
    })
  );
  t.is(subInDB?.plan, SubscriptionPlan.Pro);
  t.is(subInDB?.recurring, SubscriptionRecurring.Lifetime);
  t.is(subInDB?.status, SubscriptionStatus.Active);
  t.is(subInDB?.externalSubscriptionId, `stripe_invoice:${lifetimeInvoice.id}`);

  const paymentFact = await db.paymentEvent.findUnique({
    where: {
      provider_externalEventId: {
        provider: 'stripe',
        externalEventId: `stripe_invoice:${lifetimeInvoice.id}`,
      },
    },
  });
  t.like(paymentFact, {
    targetType: 'user',
    targetId: u1.id,
    plan: SubscriptionPlan.Pro,
    amount: lifetimeInvoice.total,
    currency: lifetimeInvoice.currency,
    processingStatus: 'processed',
  });

  t.context.stripe.invoices.retrieve.resolves(
    lifetimeInvoice as Stripe.Response<Stripe.Invoice>
  );
  await service.handleRefundedInvoice(lifetimeInvoice.id, 'refund');
  const entitlement = await db.entitlement.findFirstOrThrow({
    where: {
      source: 'cloud_subscription',
      subjectId: `stripe_invoice:${lifetimeInvoice.id}`,
    },
  });
  t.is(entitlement.status, 'revoked');
});

test('should be able to subscribe to lifetime recurring with old subscription', async t => {
  const { app, service, stripe, db, u1, event } = t.context;

  const previous = await db.providerSubscription.create({
    data: {
      provider: 'stripe',
      targetType: 'user',
      targetId: u1.id,
      externalSubscriptionId: 'sub_1',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
      status: SubscriptionStatus.Active,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 100000),
    },
  });
  await app.get(EntitlementService).upsertFromCloudSubscription({
    targetId: u1.id,
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Monthly,
    status: SubscriptionStatus.Active,
    subscriptionId: previous.id,
    stripeSubscriptionId: previous.externalSubscriptionId,
    end: previous.periodEnd,
  });
  event.emit.resetHistory();

  stripe.subscriptions.cancel.rejects(new Error('remote cancellation failed'));
  await t.throwsAsync(() => service.saveStripeInvoice(lifetimeInvoice), {
    message: 'remote cancellation failed',
  });
  const current = await db.providerSubscription.findUniqueOrThrow({
    where: {
      provider_externalSubscriptionId: {
        provider: 'stripe',
        externalSubscriptionId: 'sub_1',
      },
    },
  });
  t.is(current.status, SubscriptionStatus.Active);
  t.is(
    (
      await db.entitlement.findFirstOrThrow({
        where: { source: 'cloud_subscription', subjectId: 'sub_1' },
      })
    ).status,
    'active'
  );
  t.is(
    await db.providerSubscription.count({
      where: {
        targetId: u1.id,
        recurring: SubscriptionRecurring.Lifetime,
      },
    }),
    0
  );

  stripe.subscriptions.cancel.resolves(sub as any);
  await service.saveStripeInvoice(lifetimeInvoice);

  const subInDB = await db.providerSubscription.findFirst({
    where: {
      provider: 'stripe',
      targetType: 'user',
      targetId: u1.id,
      recurring: SubscriptionRecurring.Lifetime,
    },
  });

  t.true(
    event.emit.calledOnceWith('user.subscription.activated', {
      userId: u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Lifetime,
    })
  );
  t.is(subInDB?.plan, SubscriptionPlan.Pro);
  t.is(subInDB?.recurring, SubscriptionRecurring.Lifetime);
  t.is(subInDB?.status, SubscriptionStatus.Active);
  t.is(subInDB?.externalSubscriptionId, `stripe_invoice:${lifetimeInvoice.id}`);
  t.is(
    (
      await db.entitlement.findFirstOrThrow({
        where: { source: 'cloud_subscription', subjectId: 'sub_1' },
      })
    ).status,
    'revoked'
  );
  t.is(stripe.subscriptions.cancel.callCount, 2);
  t.deepEqual(
    stripe.subscriptions.cancel.firstCall.lastArg,
    stripe.subscriptions.cancel.secondCall.lastArg
  );
});

test('should not be able to cancel lifetime subscription', async t => {
  const { service, db, u1 } = t.context;

  await db.providerSubscription.create({
    data: {
      provider: 'stripe',
      targetType: 'user',
      targetId: u1.id,
      externalSubscriptionId: 'stripe_invoice:lifetime_cancel',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Lifetime,
      status: SubscriptionStatus.Active,
      periodStart: new Date(),
      periodEnd: null,
    },
  });

  await t.throwsAsync(
    () =>
      service.cancelSubscription({
        plan: SubscriptionPlan.Pro,
        userId: u1.id,
      }),
    { message: 'Onetime payment subscription cannot be canceled.' }
  );
});

test('should not be able to update lifetime recurring', async t => {
  const { service, db, u1 } = t.context;

  await db.providerSubscription.create({
    data: {
      provider: 'stripe',
      targetType: 'user',
      targetId: u1.id,
      externalSubscriptionId: 'stripe_invoice:lifetime_update',
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Lifetime,
      status: SubscriptionStatus.Active,
      periodStart: new Date(),
      periodEnd: null,
    },
  });

  await t.throwsAsync(
    () =>
      service.updateSubscriptionRecurring(
        {
          plan: SubscriptionPlan.Pro,
          userId: u1.id,
        },
        SubscriptionRecurring.Monthly
      ),
    { message: 'You cannot update an onetime payment subscription.' }
  );
});

// TEAM
test('should be able to list prices for team', async t => {
  const { service } = t.context;

  const prices = await service.listPrices(undefined);

  t.deepEqual(
    prices.map(p => encodeLookupKey(p.lookupKey)),
    NORMAL_USER_PRICES
  );
});

test('should be able to checkout for team', async t => {
  const { service, u1, stripe } = t.context;

  await service.checkout(
    {
      plan: SubscriptionPlan.Team,
      recurring: SubscriptionRecurring.Monthly,
      variant: null,
      successCallbackLink: '',
    },
    {
      user: u1,
      workspaceId: 'ws_1',
    }
  );

  t.deepEqual(getLastCheckoutPrice(stripe.checkout.sessions.create), {
    price: TEAM_MONTHLY,
    coupon: undefined,
  });
});

test('should not be able to checkout for workspace if subscribed', async t => {
  const { service, u1, db } = t.context;

  await db.providerSubscription.create({
    data: {
      provider: 'stripe',
      targetType: 'workspace',
      targetId: 'ws_1',
      externalSubscriptionId: 'sub_1',
      plan: SubscriptionPlan.Team,
      recurring: SubscriptionRecurring.Monthly,
      status: SubscriptionStatus.Active,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 100000),
      quantity: 1,
    },
  });

  await t.throwsAsync(
    () =>
      service.checkout(
        {
          plan: SubscriptionPlan.Team,
          recurring: SubscriptionRecurring.Monthly,
          variant: null,
          successCallbackLink: '',
        },
        {
          user: u1,
          workspaceId: 'ws_1',
        }
      ),
    { message: 'You have already subscribed to the team plan.' }
  );
});

test('should be able to checkout for workspace after canceled subscription', async t => {
  const { service, u1, db, stripe } = t.context;

  await db.providerSubscription.create({
    data: {
      provider: 'stripe',
      targetType: 'workspace',
      targetId: 'ws_1',
      externalSubscriptionId: 'sub_1',
      plan: SubscriptionPlan.Team,
      recurring: SubscriptionRecurring.Monthly,
      status: SubscriptionStatus.Canceled,
      periodStart: new Date(Date.now() - 100000),
      periodEnd: new Date(Date.now() - 1000),
      quantity: 1,
    },
  });

  await service.checkout(
    {
      plan: SubscriptionPlan.Team,
      recurring: SubscriptionRecurring.Monthly,
      variant: null,
      successCallbackLink: '',
    },
    {
      user: u1,
      workspaceId: 'ws_1',
    }
  );

  t.deepEqual(getLastCheckoutPrice(stripe.checkout.sessions.create), {
    price: TEAM_MONTHLY,
    coupon: undefined,
  });
});

const teamSub: Stripe.Subscription = {
  ...sub,
  items: {
    object: 'list',
    data: [
      {
        id: 'si_1',
        // @ts-expect-error stub
        price: {
          id: TEAM_MONTHLY,
          lookup_key: 'team_monthly',
        },
        subscription: 'sub_1',
        quantity: 1,
      },
    ],
  },
  metadata: {
    workspaceId: 'ws_1',
  },
};

test('should be able to create team subscription', async t => {
  const { event, service, db } = t.context;

  await service.saveStripeSubscription(teamSub);

  const subInDB = await db.providerSubscription.findFirst({
    where: { targetType: 'workspace', targetId: 'ws_1' },
  });

  t.true(
    event.emit.calledOnceWith('workspace.subscription.activated', {
      workspaceId: 'ws_1',
      plan: SubscriptionPlan.Team,
      recurring: SubscriptionRecurring.Monthly,
      quantity: 1,
    })
  );
  t.is(subInDB?.externalSubscriptionId, sub.id);
});

test('should preserve old team provider fact when stripe creates a new subscription', async t => {
  const { service, db } = t.context;

  await db.providerSubscription.create({
    data: {
      provider: 'stripe',
      targetType: 'workspace',
      targetId: 'ws_1',
      externalSubscriptionId: 'sub_old_team',
      plan: SubscriptionPlan.Team,
      recurring: SubscriptionRecurring.Yearly,
      status: SubscriptionStatus.Canceled,
      periodStart: new Date('2026-03-26T08:23:57.000Z'),
      periodEnd: new Date('2027-03-26T08:23:57.000Z'),
      quantity: 24,
    },
  });

  await service.saveStripeSubscription({
    ...teamSub,
    id: 'sub_new_team',
    status: SubscriptionStatus.Active,
    items: {
      ...teamSub.items,
      data: [
        {
          ...teamSub.items.data[0],
          quantity: 11,
        },
      ],
    },
  });

  const subscriptions = await db.providerSubscription.findMany({
    where: {
      provider: 'stripe',
      targetType: 'workspace',
      targetId: 'ws_1',
      plan: SubscriptionPlan.Team,
    },
    orderBy: { externalSubscriptionId: 'asc' },
  });

  t.is(subscriptions.length, 2);
  t.is(subscriptions[0].externalSubscriptionId, 'sub_new_team');
  t.is(subscriptions[0].status, SubscriptionStatus.Active);
  t.is(subscriptions[0].quantity, 11);
  t.is(subscriptions[1].externalSubscriptionId, 'sub_old_team');
  t.is(subscriptions[1].status, SubscriptionStatus.Canceled);
});

test('should be able to update team subscription', async t => {
  const { service, db, event } = t.context;

  await service.saveStripeSubscription(teamSub);

  await service.saveStripeSubscription({
    ...teamSub,
    items: {
      ...teamSub.items,
      data: [
        {
          ...teamSub.items.data[0],
          quantity: 2,
        },
      ],
    },
  });

  const subInDB = await db.providerSubscription.findFirst({
    where: { targetType: 'workspace', targetId: 'ws_1' },
  });

  t.is(subInDB?.quantity, 2);

  t.true(
    event.emit.calledWith('workspace.subscription.activated', {
      workspaceId: 'ws_1',
      plan: SubscriptionPlan.Team,
      recurring: SubscriptionRecurring.Monthly,
      quantity: 2,
    })
  );
});

test('should persist mutable team subscription fields on same stripe subscription update', async t => {
  const { service, db } = t.context;

  await service.saveStripeSubscription(teamSub);

  await service.saveStripeSubscription({
    ...teamSub,
    current_period_start: 1780000000,
    current_period_end: 1811536000,
    trial_start: 1780000000,
    trial_end: 1780604800,
    items: {
      ...teamSub.items,
      data: [
        {
          ...teamSub.items.data[0],
          quantity: 9,
          price: {
            ...PRICES[TEAM_YEARLY],
            lookup_key: TEAM_YEARLY,
          },
        },
      ],
    },
  });

  const entitlement = await db.entitlement.findFirst({
    where: {
      source: 'cloud_subscription',
      subjectId: teamSub.id,
    },
  });
  const providerFact = await db.providerSubscription.findUnique({
    where: {
      provider_externalSubscriptionId: {
        provider: 'stripe',
        externalSubscriptionId: teamSub.id,
      },
    },
  });

  t.like(providerFact, {
    recurring: SubscriptionRecurring.Yearly,
    quantity: 9,
    periodStart: new Date(1780000000 * 1000),
    periodEnd: new Date(1811536000 * 1000),
    trialStart: new Date(1780000000 * 1000),
    trialEnd: new Date(1780604800 * 1000),
  });
  t.like(entitlement, {
    plan: 'team',
    quantity: 9,
    startsAt: new Date(1780000000 * 1000),
    expiresAt: new Date(1811536000 * 1000),
  });
  t.like(providerFact, {
    recurring: SubscriptionRecurring.Yearly,
    externalPriceId: TEAM_YEARLY,
    currency: 'usd',
    amount: 14400,
    quantity: 9,
    periodStart: new Date(1780000000 * 1000),
    periodEnd: new Date(1811536000 * 1000),
    trialStart: new Date(1780000000 * 1000),
    trialEnd: new Date(1780604800 * 1000),
  });
});

test('should suspend on dispute and restore when dispute won', async t => {
  const { service, db, stripe, event } = t.context;

  const invoice: Stripe.Invoice = {
    id: 'in_dispute_1',
    object: 'invoice',
    status: 'paid',
    customer_email: 'u1@affine.pro',
    subscription: 'sub_1',
    lines: {
      object: 'list',
      data: [
        {
          id: 'il_1',
          object: 'line_item',
          amount: 799,
          currency: 'usd',
          description: '',
          discount_amounts: [],
          discountable: false,
          livemode: false,
          metadata: {},
          period: {
            start: unixNow() - 60 * 60 * 24,
            end: unixNow() + 60 * 60 * 24 * 30,
          },
          price: {
            ...PRICES[PRO_MONTHLY],
          } as any,
          quantity: 1,
        } as any,
      ],
      has_more: false,
      total_count: 1,
      url: '',
    },
  } as any;

  stripe.invoices.retrieve.resolves(invoice as any);
  stripe.subscriptions.retrieve.resolves(sub as any);
  stripe.subscriptions.cancel.resolves(sub as any);

  await service.saveStripeSubscription(sub as any);

  event.emit.resetHistory();
  stripe.subscriptions.cancel.resetHistory();

  await service.handleRefundedInvoice(invoice.id, 'dispute_open');

  const suspended = await db.providerSubscription.findUnique({
    where: {
      provider_externalSubscriptionId: {
        provider: 'stripe',
        externalSubscriptionId: 'sub_1',
      },
    },
  });

  t.is(suspended?.status, SubscriptionStatus.Canceled);
  t.true(
    event.emit.calledWith('user.subscription.canceled', {
      userId: t.context.u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
    })
  );
  t.false(stripe.subscriptions.cancel.called);

  event.emit.resetHistory();

  await service.handleRefundedInvoice(invoice.id, 'dispute_won');

  const restored = await db.providerSubscription.findUnique({
    where: {
      provider_externalSubscriptionId: {
        provider: 'stripe',
        externalSubscriptionId: 'sub_1',
      },
    },
  });

  t.truthy(restored);
  t.is(restored?.status, SubscriptionStatus.Active);
  t.true(
    event.emit.calledWith('user.subscription.activated', {
      userId: t.context.u1.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
    })
  );
});

test('should keep selfhost provider identity and license source on replay and cancellation', async t => {
  const { app, db, service } = t.context;
  const selfhostSubscription = {
    ...sub,
    id: 'sub_selfhost',
    schedule: 'schedule_selfhost',
    items: {
      ...sub.items,
      data: [
        {
          ...sub.items.data[0],
          quantity: 5,
          subscription: 'sub_selfhost',
          price: {
            id: 'price_selfhost',
            lookup_key: `${SubscriptionPlan.SelfHostedTeam}_${SubscriptionRecurring.Yearly}`,
            product: 'product_selfhost',
            currency: 'usd',
            unit_amount: 12000,
          },
        },
      ],
    },
  } as Stripe.Subscription;

  await service.saveStripeSubscription(selfhostSubscription);
  const first = await db.providerSubscription.findUniqueOrThrow({
    where: {
      provider_externalSubscriptionId: {
        provider: 'stripe',
        externalSubscriptionId: selfhostSubscription.id,
      },
    },
  });
  await db.providerSubscription.create({
    data: {
      provider: 'revenuecat',
      targetType: 'instance',
      targetId: first.targetId,
      plan: SubscriptionPlan.SelfHostedTeam,
      recurring: SubscriptionRecurring.Yearly,
      status: SubscriptionStatus.Active,
      iapStore: 'app_store',
      externalCustomerId: 'selfhost-customer',
      externalProductId: 'selfhost-product',
      externalRef: 'selfhost-ref',
    },
  });
  const selected = await app
    .get(SelfhostTeamSubscriptionManager)
    .getSubscription({
      key: first.targetId,
      plan: SubscriptionPlan.SelfHostedTeam,
    });
  t.is(selected?.provider, 'stripe');

  await service.saveStripeSubscription({
    ...selfhostSubscription,
    items: {
      ...selfhostSubscription.items,
      data: [{ ...selfhostSubscription.items.data[0], quantity: 7 }],
    },
  });

  const replayed = await db.providerSubscription.findUniqueOrThrow({
    where: {
      provider_externalSubscriptionId: {
        provider: 'stripe',
        externalSubscriptionId: selfhostSubscription.id,
      },
    },
  });
  t.is(replayed.targetId, first.targetId);
  t.is(replayed.quantity, 7);
  t.is(await db.license.count({ where: { key: first.targetId } }), 1);
  t.is(app.mails.count('TeamLicense'), 1);

  await service.deleteStripeSubscription({
    ...selfhostSubscription,
    status: SubscriptionStatus.Canceled,
  });

  t.is(
    (
      await db.providerSubscription.findUniqueOrThrow({
        where: { id: first.id },
      })
    ).status,
    SubscriptionStatus.Canceled
  );
  t.is(await db.license.count({ where: { key: first.targetId } }), 1);
});

// NOTE(@forehalo): cancel and resume a team subscription share the same logic with user subscription
test.skip('should be able to cancel team subscription', async () => {});
test.skip('should be able to resume team subscription', async () => {});
