import '../../plugins/payment';

import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';
import Stripe from 'stripe';

import { AppModule } from '../../app.module';
import { EventBus } from '../../base';
import { ConfigFactory, ConfigModule } from '../../base/config';
import { StripeFactory } from '../../plugins/payment/stripe';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
} from '../../plugins/payment/types';
import { createTestingApp, TestingApp } from '../utils';

const CREATE_CHECKOUT_SESSION = `
  mutation CreateCheckoutSession($input: CreateCheckoutSessionInput!) {
    createCheckoutSession(input: $input)
  }
`;

const PRO_YEARLY = `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Yearly}`;
const SELFHOST_YEARLY = `${SubscriptionPlan.SelfHostedTeam}_${SubscriptionRecurring.Yearly}`;

const PRICES: Record<string, Stripe.Price> = {
  [PRO_YEARLY]: {
    id: PRO_YEARLY,
    object: 'price',
    active: true,
    billing_scheme: 'per_unit',
    created: 0,
    currency: 'usd',
    custom_unit_amount: null,
    livemode: false,
    lookup_key: PRO_YEARLY,
    metadata: {},
    nickname: null,
    product: 'prod_pro',
    recurring: {
      aggregate_usage: null,
      interval: 'year',
      interval_count: 1,
      meter: null,
      trial_period_days: null,
      usage_type: 'licensed',
    },
    tax_behavior: 'unspecified',
    tiers_mode: null,
    transform_quantity: null,
    type: 'recurring',
    unit_amount: 8100,
    unit_amount_decimal: '8100',
  },
  [SELFHOST_YEARLY]: {
    id: SELFHOST_YEARLY,
    object: 'price',
    active: true,
    billing_scheme: 'per_unit',
    created: 0,
    currency: 'usd',
    custom_unit_amount: null,
    livemode: false,
    lookup_key: SELFHOST_YEARLY,
    metadata: {},
    nickname: null,
    product: 'prod_selfhost',
    recurring: {
      aggregate_usage: null,
      interval: 'year',
      interval_count: 1,
      meter: null,
      trial_period_days: null,
      usage_type: 'licensed',
    },
    tax_behavior: 'unspecified',
    tiers_mode: null,
    transform_quantity: null,
    type: 'recurring',
    unit_amount: 12000,
    unit_amount_decimal: '12000',
  },
};

type StripeStubs = {
  customers: Sinon.SinonStubbedInstance<Stripe.CustomersResource>;
  prices: Sinon.SinonStubbedInstance<Stripe.PricesResource>;
  subscriptions: Sinon.SinonStubbedInstance<Stripe.SubscriptionsResource>;
  charges: Sinon.SinonStubbedInstance<Stripe.ChargesResource>;
  invoices: Sinon.SinonStubbedInstance<Stripe.InvoicesResource>;
  checkout: {
    sessions: Sinon.SinonStubbedInstance<Stripe.Checkout.SessionsResource>;
  };
};

const test = ava as TestFn<{
  app: TestingApp;
  stripe: StripeStubs;
}>;

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
    tapModule: module => {
      module
        .overrideProvider(EventBus)
        .useValue(Sinon.createStubInstance(EventBus));
    },
  });

  const stripeFactory = app.get(StripeFactory);
  await stripeFactory.onConfigInit();
  const stripe = stripeFactory.stripe;

  t.context = {
    app,
    stripe: {
      customers: Sinon.stub(stripe.customers),
      prices: Sinon.stub(stripe.prices),
      subscriptions: Sinon.stub(stripe.subscriptions),
      charges: Sinon.stub(stripe.charges),
      invoices: Sinon.stub(stripe.invoices),
      checkout: {
        sessions: Sinon.stub(stripe.checkout.sessions),
      },
    },
  };
});

test.beforeEach(async t => {
  const { app, stripe } = t.context;
  await app.initTestingDB();
  app.get(ConfigFactory).override({
    payment: {
      showLifetimePrice: true,
      dubAffiliateEnabled: true,
      dubAffiliateExcludedPromotionCodes: [],
      revenuecat: { enabled: false },
    },
  });

  Sinon.reset();

  // @ts-expect-error Stripe list fixture only needs data consumed by checkout.
  stripe.prices.list.callsFake((params: Stripe.PriceListParams) =>
    Promise.resolve({
      data: (params.lookup_keys ?? []).map(key => PRICES[key]),
    })
  );
  // @ts-expect-error Complete fields consumed by the payment managers.
  stripe.subscriptions.list.resolves({ data: [] });
  stripe.customers.retrieve.resolves({
    id: 'cus_graphql',
    object: 'customer',
    deleted: false,
    metadata: {},
  } as any);
  stripe.customers.update.resolves({
    id: 'cus_graphql',
    object: 'customer',
    deleted: false,
    metadata: {},
  } as any);
  // @ts-expect-error Complete fields consumed by DubAffiliateService.
  stripe.charges.list.resolves({ data: [], has_more: false });
  // @ts-expect-error Complete fields consumed by DubAffiliateService.
  stripe.invoices.list.resolves({ data: [], has_more: false });
  stripe.checkout.sessions.create.resolves({
    id: 'cs_graphql',
    object: 'checkout.session',
    url: 'https://checkout.stripe.test/cs_graphql',
  } as any);
});

test.after.always(async t => {
  await t.context.app.close();
});

test('Web Pro GraphQL checkout reaches Dub Customer update and Checkout metadata', async t => {
  const { app, stripe } = t.context;
  const user = await app.signup();
  await app.get(PrismaClient).userStripeCustomer.create({
    data: { userId: user.id, stripeCustomerId: 'cus_graphql' },
  });
  app.withCookies({ dub_id: 'click_graphql_web' });

  const result = await app.gql<{ createCheckoutSession: string }>(
    CREATE_CHECKOUT_SESSION,
    {
      input: {
        plan: 'Pro',
        recurring: 'Yearly',
        successCallbackLink: '/settings',
      },
    }
  );

  t.is(result.createCheckoutSession, 'https://checkout.stripe.test/cs_graphql');
  t.like(stripe.customers.update.firstCall.args[1], {
    metadata: {
      dubClickId: 'click_graphql_web',
      dubCustomerExternalId: user.id,
    },
  });
  const checkout = stripe.checkout.sessions.create.getCall(0)!
    .args[0] as Stripe.Checkout.SessionCreateParams;
  t.like(checkout, {
    customer: 'cus_graphql',
    metadata: { dubCustomerExternalId: user.id },
  });
});

test('native Pro GraphQL checkout reaches the manager without Dub attribution', async t => {
  const { app, stripe } = t.context;
  const user = await app.signup();
  await app.get(PrismaClient).userStripeCustomer.create({
    data: { userId: user.id, stripeCustomerId: 'cus_graphql' },
  });
  app.withCookies({ dub_id: 'click_graphql_native' });

  const response = await app
    .POST('/graphql')
    .set('x-operation-name', 'CreateCheckoutSession')
    .set('x-affine-client-kind', 'native')
    .send({
      query: CREATE_CHECKOUT_SESSION,
      variables: {
        input: {
          plan: 'Pro',
          recurring: 'Yearly',
          successCallbackLink: '/settings',
        },
      },
    });

  t.is(response.status, 200);
  t.falsy(response.body.errors);
  t.false(stripe.customers.update.called);
  const checkout = stripe.checkout.sessions.create.getCall(0)!
    .args[0] as Stripe.Checkout.SessionCreateParams;
  t.false('metadata' in checkout);
});

test('public SelfHostedTeam GraphQL checkout uses its manager without Dub attribution', async t => {
  const { app, stripe } = t.context;
  app.withCookies({ dub_id: 'click_graphql_selfhosted' });

  const result = await app.gql<{ createCheckoutSession: string }>(
    CREATE_CHECKOUT_SESSION,
    {
      input: {
        plan: 'SelfHostedTeam',
        recurring: 'Yearly',
        successCallbackLink: '/selfhosted',
        args: { quantity: 12 },
      },
    }
  );

  t.is(result.createCheckoutSession, 'https://checkout.stripe.test/cs_graphql');
  t.false(stripe.customers.update.called);
  const checkout = stripe.checkout.sessions.create.getCall(0)!
    .args[0] as Stripe.Checkout.SessionCreateParams;
  t.false('customer' in checkout);
  t.false('metadata' in checkout);
});
