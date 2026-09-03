import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import { AppModule } from '../../app.module';
import { SubscriptionService } from '../../plugins/payment/service';
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

type CheckoutInput = {
  plan: 'Pro' | 'Team' | 'SelfHostedTeam';
  recurring: 'Monthly' | 'Yearly';
  successCallbackLink: string;
  args?: { workspaceId?: string; quantity?: number };
};

const test = ava as TestFn<{
  app: TestingApp;
  checkout: Sinon.SinonStub;
}>;

test.before(async t => {
  const checkout = Sinon.stub().resolves({
    url: 'https://checkout.stripe.test/session',
  });
  const app = await createTestingApp({
    imports: [AppModule],
    tapModule: module => {
      module.overrideProvider(SubscriptionService).useValue({ checkout });
    },
  });

  t.context = { app, checkout };
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();
  t.context.checkout.resetHistory();
});

test.after.always(async t => {
  await t.context.app.close();
});

async function checkoutWithGql(app: TestingApp, input: CheckoutInput) {
  return app.gql<{ createCheckoutSession: string }>(CREATE_CHECKOUT_SESSION, {
    input,
  });
}

test('passes the Dub cookie through authenticated Web Pro GraphQL checkout', async t => {
  const { app, checkout } = t.context;
  const user = await app.signup();
  app.withCookies({ dub_id: 'click_web' });

  const result = await checkoutWithGql(app, {
    plan: 'Pro',
    recurring: 'Yearly',
    successCallbackLink: '/settings',
  });

  t.is(result.createCheckoutSession, 'https://checkout.stripe.test/session');
  t.true(checkout.calledOnce);
  t.deepEqual(checkout.firstCall.args[0], {
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Yearly,
    successCallbackLink: '/settings',
  });
  t.like(checkout.firstCall.args[1].user, {
    id: user.id,
    email: user.email,
  });
  t.is(checkout.firstCall.args[1].dubClickId, 'click_web');
});

test('excludes the Dub cookie from authenticated native GraphQL checkout', async t => {
  const { app, checkout } = t.context;
  const user = await app.signup();
  app.withCookies({ dub_id: 'click_native' });

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
  t.is(
    response.body.data.createCheckoutSession,
    'https://checkout.stripe.test/session'
  );
  t.true(checkout.calledOnce);
  t.like(checkout.firstCall.args[1].user, {
    id: user.id,
    email: user.email,
  });
  t.is(checkout.firstCall.args[1].dubClickId, undefined);
});

test('does not add Dub data to public SelfHostedTeam GraphQL checkout args', async t => {
  const { app, checkout } = t.context;
  app.withCookies({ dub_id: 'click_selfhosted' });

  const result = await checkoutWithGql(app, {
    plan: 'SelfHostedTeam',
    recurring: 'Yearly',
    successCallbackLink: '/selfhosted',
    args: { quantity: 12 },
  });

  t.is(result.createCheckoutSession, 'https://checkout.stripe.test/session');
  t.deepEqual(checkout.firstCall.args[1], {
    plan: SubscriptionPlan.SelfHostedTeam,
    quantity: 12,
    user: undefined,
  });
  t.false('dubClickId' in checkout.firstCall.args[1]);
});

test('preserves workspaceId and passes the Dub cookie for Web Team checkout', async t => {
  const { app, checkout } = t.context;
  const user = await app.signup();
  app.withCookies({ dub_id: 'click_team' });

  const result = await checkoutWithGql(app, {
    plan: 'Team',
    recurring: 'Monthly',
    successCallbackLink: '/workspace',
    args: { workspaceId: 'workspace_test' },
  });

  t.is(result.createCheckoutSession, 'https://checkout.stripe.test/session');
  t.like(checkout.firstCall.args[1].user, {
    id: user.id,
    email: user.email,
  });
  t.is(checkout.firstCall.args[1].workspaceId, 'workspace_test');
  t.is(checkout.firstCall.args[1].dubClickId, 'click_team');
});

test('keeps Web checkout attribution empty when no Dub cookie exists', async t => {
  const { app, checkout } = t.context;
  await app.signup();

  await checkoutWithGql(app, {
    plan: 'Pro',
    recurring: 'Monthly',
    successCallbackLink: '/settings',
  });

  t.true(checkout.calledOnce);
  t.is(checkout.firstCall.args[1].dubClickId, undefined);
});
