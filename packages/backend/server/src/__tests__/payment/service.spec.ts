import { PrismaClient } from '@prisma/client';
import ava from 'ava';
import Sinon from 'sinon';

import type { Config } from '../../base';
import {
  CantUpdateOnetimePaymentSubscription,
  SameSubscriptionRecurring,
  SubscriptionAlreadyExists,
  SubscriptionNotExists,
  URLHelper,
} from '../../base';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { ServerFeature, ServerService } from '../../core/config';
import { UserSubscriptionResolver } from '../../plugins/payment/read-resolver';
import {
  SubscriptionService,
  userSubscriptionIdentity,
} from '../../plugins/payment/service';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
} from '../../plugins/payment/types';

ava(
  'payment protocol adapter preserves filtering, commands, dates, and errors',
  async t => {
    const runtime = Sinon.createStubInstance(BackendRuntimeProvider);
    const command = runtime.executePaymentCommandV1 as Sinon.SinonStub;
    const server = Sinon.createStubInstance(ServerService);
    const url = Sinon.createStubInstance(URLHelper);
    url.safeLink.callsFake(path => new URL(path, 'https://app.example').href);
    const config = {
      payment: { showLifetimePrice: false },
    } as Config;
    const service = new SubscriptionService(runtime, config, server, url);
    const paymentEnabled = runtime.paymentEnabled as Sinon.SinonStub;

    paymentEnabled.returns(false);
    service.onConfigInit();
    t.true(server.disableFeature.calledWith(ServerFeature.Payment));
    paymentEnabled.returns(true);
    service.onConfigApplied({ updates: { payment: { enabled: true } } });
    t.true(server.enableFeature.calledWith(ServerFeature.Payment));

    command.resolves([
      {
        id: 'price-pro-monthly',
        plan: 'pro',
        recurring: 'monthly',
        variant: null,
        currency: 'usd',
        amount: 799,
      },
      {
        id: 'price-pro-lifetime',
        plan: 'pro',
        recurring: 'lifetime',
        variant: null,
        currency: 'usd',
        amount: 49900,
      },
      {
        id: 'price-ai-lifetime',
        plan: 'ai',
        recurring: 'lifetime',
        variant: null,
        currency: 'usd',
        amount: 99900,
      },
      {
        id: 'price-team-yearly',
        plan: 'team',
        recurring: 'yearly',
        variant: null,
        currency: 'usd',
        amount: 14400,
      },
    ]);
    t.deepEqual(
      (await service.listPrices()).map(({ lookupKey }) => lookupKey),
      [
        { plan: 'pro', recurring: 'monthly', variant: null },
        { plan: 'team', recurring: 'yearly', variant: null },
      ]
    );

    config.payment.showLifetimePrice = true;
    t.deepEqual(
      (await service.listPrices()).map(({ price }) => price.id),
      ['price-pro-monthly', 'price-pro-lifetime', 'price-team-yearly']
    );

    command.resolves({
      url: 'https://billing.example/checkout',
      sessionId: 'cs_1',
      targetId: 'user-1',
    });
    t.deepEqual(
      await service.checkout(
        {
          plan: SubscriptionPlan.Pro,
          recurring: SubscriptionRecurring.Monthly,
          successCallbackLink: '/success',
          idempotencyKey: 'intent-1',
        },
        { user: { id: 'user-1', email: 'user@example.com' } }
      ),
      { id: 'cs_1', url: 'https://billing.example/checkout' }
    );
    t.like(command.lastCall.args[0], {
      action: 'create_checkout',
      actorUserId: 'user-1',
      targetType: 'user',
      targetId: 'user-1',
      successUrl: 'https://app.example/success',
      intentId: 'intent-1',
    });

    const timestamp = '2026-09-06T00:00:00.000Z';
    const nativeSubscription = {
      stripeSubscriptionId: 'sub_1',
      stripeScheduleId: null,
      status: 'active',
      plan: 'pro',
      recurring: 'monthly',
      variant: null,
      quantity: 1,
      start: timestamp,
      end: null,
      trialStart: null,
      trialEnd: null,
      nextBillAt: timestamp,
      canceledAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    command.resolves(nativeSubscription);
    const canceled = await service.cancelSubscription(
      userSubscriptionIdentity(SubscriptionPlan.Pro, 'user-1'),
      'intent-2'
    );
    t.true(canceled.start instanceof Date);
    t.true(canceled.nextBillAt instanceof Date);
    t.true(canceled.createdAt instanceof Date);
    t.like(command.lastCall.args[0], {
      action: 'mutate_subscription',
      mutation: 'cancel',
      actorUserId: 'user-1',
      intentId: 'intent-2',
    });

    const read = new UserSubscriptionResolver(
      Sinon.createStubInstance(PrismaClient),
      runtime
    );
    const nativeBilling = {
      subscriptions: [nativeSubscription],
      conflicts: [],
      manageable: [],
    };
    const list = runtime.listPaymentSubscriptionsV1 as Sinon.SinonStub;
    list.resolves(nativeBilling);
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      avatarUrl: null,
      disabled: false,
      hasPassword: true,
      emailVerified: true,
    };
    t.deepEqual(await read.subscriptionBilling(user, user), {
      subscriptions: [canceled],
      conflicts: [],
      manageable: [],
    });
    t.true(list.calledOnceWithExactly('user', user.id));

    command.resetHistory();
    command.resolves(nativeBilling);
    t.deepEqual(await read.refreshUserSubscriptions(user), [canceled]);
    t.true(
      command.calledOnceWithExactly({
        action: 'refresh_subscriptions',
        userId: user.id,
      })
    );
    t.true(list.calledOnce);

    const portal = runtime.createPaymentCustomerPortalV1 as Sinon.SinonStub;
    portal.resolves('https://billing.example/portal');
    t.is(
      await service.createCustomerPortal('user-1'),
      'https://billing.example/portal'
    );
    t.deepEqual(portal.lastCall.args, ['user-1']);

    t.throws(() => userSubscriptionIdentity(SubscriptionPlan.Team, 'user-1'), {
      instanceOf: SubscriptionNotExists,
    });
    command.rejects(new Error('subscription_already_exists'));
    await t.throwsAsync(
      service.checkout(
        {
          plan: SubscriptionPlan.Pro,
          recurring: SubscriptionRecurring.Monthly,
          successCallbackLink: 'https://app.example/success',
        },
        { user: { id: 'user-1', email: 'user@example.com' } }
      ),
      { instanceOf: SubscriptionAlreadyExists }
    );
    command.rejects(new Error('cant_update_onetime_subscription'));
    await t.throwsAsync(
      service.cancelSubscription(
        userSubscriptionIdentity(SubscriptionPlan.Pro, 'user-1')
      ),
      { instanceOf: CantUpdateOnetimePaymentSubscription }
    );
    command.rejects(new Error('same_subscription_recurring'));
    const sameRecurring = await t.throwsAsync(
      service.updateSubscriptionRecurring(
        userSubscriptionIdentity(SubscriptionPlan.Pro, 'user-1'),
        SubscriptionRecurring.Yearly
      ),
      { instanceOf: SameSubscriptionRecurring }
    );
    t.deepEqual(sameRecurring.data, {
      recurring: SubscriptionRecurring.Yearly,
    });
  }
);
