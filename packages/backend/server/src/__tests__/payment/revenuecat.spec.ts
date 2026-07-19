import { PrismaClient, type User } from '@prisma/client';
import ava, { TestFn } from 'ava';
import { omit } from 'lodash-es';
import Sinon from 'sinon';

import {
  EventBus,
  ManagedByAppStoreOrPlay,
  SubscriptionAlreadyExists,
} from '../../base';
import { ConfigModule } from '../../base/config';
import { EntitlementService } from '../../core/entitlement';
import { FeatureService } from '../../core/features';
import { Models } from '../../models';
import { PaymentModule } from '../../plugins/payment';
import { SubscriptionCronJobs } from '../../plugins/payment/cron';
import { UserSubscriptionManager } from '../../plugins/payment/manager';
import { UserSubscriptionResolver } from '../../plugins/payment/resolver';
import {
  RcEvent,
  resolveProductMapping,
  RevenueCatService,
  RevenueCatWebhookController,
  RevenueCatWebhookHandler,
  type Subscription,
} from '../../plugins/payment/revenuecat';
import { SubscriptionService } from '../../plugins/payment/service';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '../../plugins/payment/types';
import { createTestingApp, TestingApp } from '../utils';

type Ctx = {
  module: TestingApp;
  db: PrismaClient;
  models: Models;
  event: Sinon.SinonStubbedInstance<EventBus>;

  service: SubscriptionService;
  rc: RevenueCatService;
  webhook: RevenueCatWebhookHandler;
  controller: RevenueCatWebhookController;
  subResolver: UserSubscriptionResolver;

  mockAlias: (appUserId: string) => Sinon.SinonStub;
  mockSub: (subs: Subscription[]) => Sinon.SinonStub;
  mockSubSeq: (sequences: Subscription[][]) => Sinon.SinonStub;
  triggerWebhook: (
    userId: string,
    event: Omit<RcEvent, 'app_id' | 'environment'>
  ) => Promise<void>;
  collectEvents: () => {
    activatedCount: number;
    canceledCount: number;
    events: Record<string, any[]>;
  };
};

const test = ava as TestFn<Ctx>;
let user: User;

test.beforeEach(async t => {
  const app = await createTestingApp({
    imports: [
      ConfigModule.override({
        payment: {
          revenuecat: {
            enabled: true,
            webhookAuth: '42',
          },
        },
      }),
      PaymentModule,
    ],
    tapModule: m => {
      m.overrideProvider(FeatureService).useValue(
        Sinon.createStubInstance(FeatureService)
      );
      m.overrideProvider(EventBus).useValue(Sinon.createStubInstance(EventBus));
    },
  });

  const db = app.get(PrismaClient);
  const models = app.get(Models);
  const event = app.get(EventBus) as Sinon.SinonStubbedInstance<EventBus>;

  const service = app.get(SubscriptionService);
  const rc = app.get(RevenueCatService);
  const webhook = app.get(RevenueCatWebhookHandler);
  const controller = app.get(RevenueCatWebhookController);
  const subResolver = app.get(UserSubscriptionResolver);

  t.context.module = app;
  t.context.db = db;
  t.context.models = models;
  t.context.event = event;

  t.context.service = service;
  t.context.rc = rc;
  t.context.webhook = webhook;
  t.context.controller = controller;
  t.context.subResolver = subResolver;

  const customerId = 'cust';
  t.context.mockAlias = appUserId =>
    Sinon.stub(rc, 'getCustomerAlias').resolves([appUserId]);
  t.context.mockSub = subs =>
    Sinon.stub(rc, 'getSubscriptions').resolves(
      subs.map(s => ({
        ...s,
        customerId,
        externalRef: s.externalRef ?? `rc:${s.productId}`,
      }))
    );
  t.context.mockSubSeq = sequences => {
    const stub = Sinon.stub(rc, 'getSubscriptions');
    sequences.forEach((seq, idx) => {
      const subs = seq.map(s => ({
        ...s,
        customerId,
        externalRef: s.externalRef ?? `rc:${s.productId}`,
      }));
      if (idx === 0) stub.onFirstCall().resolves(subs);
      else if (idx === 1) stub.onSecondCall().resolves(subs);
      else stub.onCall(idx).resolves(subs);
    });
    return stub;
  };
  t.context.triggerWebhook = async (appUserId, event) => {
    await webhook.onWebhook({
      appUserId,
      event: {
        ...event,
        app_id: 'app.affine.pro',
        environment: 'SANDBOX',
      } as RcEvent,
    });
  };

  t.context.collectEvents = () => {
    const events = event.emit.getCalls().reduce(
      (acc, c) => {
        const [key, value] = c.args;
        acc[key] = acc[key] || [];
        acc[key].push(value);
        return acc;
      },
      {} as { [key: string]: any[] }
    );
    const activatedCount = events['user.subscription.activated']?.length || 0;
    const canceledCount = events['user.subscription.canceled']?.length || 0;

    return { activatedCount, canceledCount, events };
  };
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
  user = await t.context.models.user.create({
    email: 'test@affine.pro',
  });
});

test.afterEach.always(async t => {
  Sinon.reset();
  await t.context.module.close();
});

test('should resolve product mapping consistently (whitelist, override, unknown)', t => {
  const override = {
    'custom.sku.monthly': { plan: 'pro', recurring: 'monthly' },
  } as Record<string, { plan: string; recurring: string }>;

  const actual = {
    whitelist: {
      proMonthly: resolveProductMapping({
        productId: 'app.affine.pro.Monthly',
      }),
      proAnnual: resolveProductMapping({ productId: 'app.affine.pro.Annual' }),
      aiAnnual: resolveProductMapping({
        productId: 'app.affine.pro.ai.Annual',
      }),
    },
    override: {
      customMonthly: resolveProductMapping(
        { productId: 'custom.sku.monthly' },
        override
      ),
    },
    unknown: resolveProductMapping({ productId: 'unknown.sku' }),
  };

  t.snapshot(actual, 'should map product for whitelist/override/unknown');
});

test('should standardize RC subscriber response and upsert subscription with observability fields', async t => {
  const { webhook, collectEvents, mockAlias, mockSub } = t.context;

  const alias = mockAlias(user.id);
  const subscriber = mockSub([
    {
      identifier: 'Pro',
      isTrial: false,
      isActive: true,
      latestPurchaseDate: new Date('2025-01-01T00:00:00.000Z'),
      expirationDate: new Date('2026-01-01T00:00:00.000Z'),
      productId: 'app.affine.pro.Annual',
      store: 'app_store',
      willRenew: true,
      duration: null,
    },
  ]);

  await webhook.onWebhook({
    appUserId: user.id,
    event: {
      id: 'evt_1',
      environment: 'PRODUCTION',
      app_id: 'app.affine.pro',
      type: 'INITIAL_PURCHASE',
      store: 'app_store',
      original_transaction_id: 'orig-tx-1',
    },
  });
  const { activatedCount, canceledCount, events } = collectEvents();

  const record = await t.context.db.providerSubscription.findFirst({
    where: { targetType: 'user', targetId: user.id, plan: 'pro' },
    select: {
      provider: true,
      iapStore: true,
      metadata: true,
      externalProductId: true,
      externalRef: true,
    },
  });

  t.snapshot(
    {
      subscriberCount: subscriber.getCalls()?.length || 0,
      activatedCount,
      canceledCount,
      lastActivated: omit(
        events['user.subscription.activated']?.slice(-1)?.[0],
        'userId'
      ),
      dbObservability: record,
    },
    'should standardize payload and have events'
  );

  const transferred = await t.context.models.user.create({
    email: 'revenuecat-transfer@affine.pro',
  });
  alias.resolves([transferred.id]);
  await webhook.onWebhook({
    appUserId: transferred.id,
    event: {
      id: 'evt_1_transfer',
      environment: 'PRODUCTION',
      app_id: 'app.affine.pro',
      type: 'TRANSFER',
      store: 'app_store',
      original_transaction_id: 'orig-tx-1',
    },
  });
  t.is(
    (
      await t.context.db.providerSubscription.findFirstOrThrow({
        where: {
          provider: 'revenuecat',
          externalRef: 'rc:app.affine.pro.Annual',
        },
      })
    ).targetId,
    transferred.id
  );
  t.true(
    t.context.event.emit.calledWith('entitlement.changed', {
      targetType: 'user',
      targetId: user.id,
    })
  );
  t.true(
    t.context.event.emit.calledWith('user.subscription.canceled', {
      userId: user.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Yearly,
    })
  );
});

test('should process expiration/refund by canceling subscription and emitting canceled', async t => {
  const { db, collectEvents, mockAlias, mockSub, triggerWebhook } = t.context;

  mockAlias(user.id);
  await db.providerSubscription.create({
    data: {
      targetType: 'user',
      targetId: user.id,
      plan: 'pro',
      status: 'active',
      provider: 'revenuecat',
      recurring: 'yearly',
      periodStart: new Date('2025-01-01T00:00:00.000Z'),
      iapStore: 'app_store',
      externalCustomerId: 'cust',
      externalProductId: 'app.affine.pro.Annual',
      externalRef: 'rc:app.affine.pro.Annual',
    },
  });

  const subscriber = mockSub([
    {
      identifier: 'Pro',
      isTrial: false,
      isActive: false,
      latestPurchaseDate: new Date('2024-01-01T00:00:00.000Z'),
      expirationDate: new Date('2024-02-01T00:00:00.000Z'),
      productId: 'app.affine.pro.Annual',
      store: 'app_store',
      willRenew: false,
      duration: null,
    },
  ]);

  await triggerWebhook(user.id, {
    id: 'evt_2',
    type: 'EXPIRATION',
    store: 'app_store',
    original_transaction_id: 'orig-tx-2',
  });

  const finalDBCount = await db.providerSubscription.count({
    where: { targetId: user.id, plan: 'pro' },
  });

  const { activatedCount, canceledCount, events } = collectEvents();
  t.snapshot(
    {
      finalDBCount,
      subscriberCount: subscriber.getCalls()?.length || 0,
      activatedEventCount: activatedCount,
      canceledEventCount: canceledCount,
      lastCanceled: omit(
        events['user.subscription.canceled']?.slice(-1)?.[0],
        'userId'
      ),
    },
    'should process expiration/refund and emit canceled'
  );
});

test('should enqueue per-user reconciliation jobs for existing RC active/trialing/past_due subscriptions', async t => {
  const { module, db } = t.context;

  const cron = module.get(SubscriptionCronJobs);

  const common = { provider: 'revenuecat', periodStart: new Date() } as const;
  await db.providerSubscription.createMany({
    data: [
      {
        targetType: 'user',
        targetId: 'u1',
        plan: 'pro',
        status: 'active',
        recurring: 'monthly',
        iapStore: 'app_store',
        externalCustomerId: 'c1',
        externalProductId: 'pro-monthly',
        externalRef: 'r1',
        ...common,
      },
      {
        targetType: 'user',
        targetId: 'u2',
        plan: 'ai',
        status: 'trialing',
        recurring: 'yearly',
        iapStore: 'app_store',
        externalCustomerId: 'c2',
        externalProductId: 'ai-yearly',
        externalRef: 'r2',
        ...common,
      },
      {
        targetType: 'user',
        targetId: 'u1',
        plan: 'ai',
        status: 'past_due',
        recurring: 'monthly',
        iapStore: 'play_store',
        externalCustomerId: 'c1',
        externalProductId: 'ai-monthly',
        externalRef: 'r3',
        ...common,
      },
    ],
  });
  await cron.reconcileRevenueCatSubscriptions();

  const calls = module.queue.add.getCalls().map(c => ({
    name: c.args[0],
    payload: c.args[1],
    opts: c.args[2],
  }));
  t.snapshot(
    {
      queued: calls,
      uniqueJobCount: calls.filter(
        c => c.name === 'nightly.revenuecat.syncUser'
      ).length,
    },
    'should enqueue per-user RC reconciliation jobs (deduplicated by userId)'
  );
});

test('should activate subscriptions via webhook for whitelisted products across stores (iOS/Android)', async t => {
  const { db, event, collectEvents, mockAlias, mockSubSeq, triggerWebhook } =
    t.context;

  mockAlias(user.id);
  const scenarios = [
    {
      name: 'Pro monthly on iOS',
      stub: [
        {
          identifier: 'Pro',
          isTrial: false,
          isActive: true,
          latestPurchaseDate: new Date('2025-01-10T00:00:00.000Z'),
          expirationDate: new Date('2025-02-10T00:00:00.000Z'),
          productId: 'app.affine.pro.Monthly',
          store: 'app_store' as const,
          willRenew: true,
          duration: null,
        },
      ],
      event: {
        id: 'evt_ios_1',
        type: 'INITIAL_PURCHASE',
        store: 'app_store',
        original_transaction_id: 'orig-ios-1',
      },
      expectedPlan: 'pro' as const,
    },
    {
      name: 'AI annual on Android',
      stub: [
        {
          identifier: 'AI',
          isTrial: false,
          isActive: true,
          latestPurchaseDate: new Date('2025-03-01T00:00:00.000Z'),
          expirationDate: new Date('2026-03-01T00:00:00.000Z'),
          productId: 'app.affine.pro.ai.Annual',
          store: 'play_store' as const,
          willRenew: true,
          duration: null,
        },
      ],
      event: {
        id: 'evt_android_1',
        type: 'INITIAL_PURCHASE',
        store: 'play_store',
        purchase_token: 'token-android-1',
      },
      expectedPlan: 'ai' as const,
    },
  ];

  const results: any[] = [];

  mockSubSeq(scenarios.map(s => s.stub));

  for (const s of scenarios) {
    // reset event history between scenarios for clean counts
    event.emit.resetHistory?.();
    await triggerWebhook(user.id, s.event);
    const rec = await db.providerSubscription.findFirst({
      where: {
        targetType: 'user',
        targetId: user.id,
        plan: s.expectedPlan,
      },
      select: {
        plan: true,
        recurring: true,
        status: true,
        provider: true,
        iapStore: true,
        metadata: true,
        externalProductId: true,
        externalRef: true,
      },
    });
    const { activatedCount } = collectEvents();
    results.push({ name: s.name, rec, activatedCount });
  }

  t.snapshot(
    { results },
    'should activate subscriptions via webhook for whitelisted products across stores (iOS/Android)'
  );
});

test('should keep active and advance period dates when a trialing subscription renews', async t => {
  const { db, collectEvents, mockAlias, mockSubSeq, triggerWebhook } =
    t.context;
  mockAlias(user.id);
  mockSubSeq([
    [
      {
        identifier: 'Pro',
        isTrial: false,
        isActive: true,
        latestPurchaseDate: new Date('2025-04-01T00:00:00.000Z'),
        expirationDate: new Date('2025-04-08T00:00:00.000Z'),
        productId: 'app.affine.pro.Annual',
        store: 'app_store',
        willRenew: true,
        duration: null,
      },
    ],
    [
      {
        identifier: 'Pro',
        isTrial: false,
        isActive: true,
        latestPurchaseDate: new Date('2025-04-08T00:00:00.000Z'),
        expirationDate: new Date('2026-04-08T00:00:00.000Z'),
        productId: 'app.affine.pro.Annual',
        store: 'app_store',
        willRenew: true,
        duration: null,
      },
    ],
  ]);

  await triggerWebhook(user.id, {
    id: 'evt_trial',
    type: 'INITIAL_PURCHASE',
    period_type: 'trial',
    store: 'app_store',
  });
  await triggerWebhook(user.id, {
    id: 'evt_renew',
    type: 'RENEWAL',
    store: 'app_store',
  });

  const rec = await db.providerSubscription.findFirst({
    where: { targetType: 'user', targetId: user.id, plan: 'pro' },
    select: { status: true, periodStart: true, periodEnd: true },
  });
  const { activatedCount, canceledCount } = collectEvents();
  t.snapshot(
    { status: rec?.status, activatedCount, canceledCount },
    'should keep active after trial renewal'
  );
});

test('should remove or cancel the record and revoke entitlement when a trialing subscription expires', async t => {
  const { db, collectEvents, mockAlias, mockSubSeq, triggerWebhook } =
    t.context;
  mockAlias(user.id);
  mockSubSeq([
    [
      {
        identifier: 'Pro',
        isTrial: false,
        isActive: true,
        latestPurchaseDate: new Date('2025-04-01T00:00:00.000Z'),
        expirationDate: new Date('2025-04-08T00:00:00.000Z'),
        productId: 'app.affine.pro.Annual',
        store: 'app_store',
        willRenew: false,
        duration: null,
      },
    ],
    [
      {
        identifier: 'Pro',
        isTrial: false,
        isActive: false,
        latestPurchaseDate: new Date('2025-04-01T00:00:00.000Z'),
        expirationDate: new Date('2025-04-08T00:00:00.000Z'),
        productId: 'app.affine.pro.Annual',
        store: 'app_store',
        willRenew: false,
        duration: null,
      },
    ],
  ]);

  await triggerWebhook(user.id, {
    id: 'evt_trial2',
    type: 'INITIAL_PURCHASE',
    period_type: 'trial',
    store: 'app_store',
  });
  await triggerWebhook(user.id, {
    id: 'evt_expire_trial',
    type: 'EXPIRATION',
    store: 'app_store',
  });

  const finalDBCount = await db.providerSubscription.count({
    where: { targetId: user.id, plan: 'pro' },
  });
  const { canceledCount } = collectEvents();
  t.snapshot({ finalDBCount, canceledCount }, 'should remove record');
});

test('should set canceledAt and keep active until expiration when will_renew is false (cancellation before period end)', async t => {
  const { db, collectEvents, mockAlias, mockSub, triggerWebhook } = t.context;
  mockAlias(user.id);
  mockSub([
    {
      identifier: 'Pro',
      isTrial: false,
      isActive: true,
      latestPurchaseDate: new Date('2025-05-01T00:00:00.000Z'),
      expirationDate: new Date('2025-06-01T00:00:00.000Z'),
      productId: 'app.affine.pro.Annual',
      store: 'app_store',
      willRenew: false,
      duration: null,
    },
  ]);

  await triggerWebhook(user.id, {
    id: 'evt_cancel_before_end',
    type: 'CANCELLATION',
    store: 'app_store',
  });
  const rec = await db.providerSubscription.findFirst({
    where: { targetType: 'user', targetId: user.id, plan: 'pro' },
    select: { status: true, canceledAt: true },
  });
  const { activatedCount, canceledCount } = collectEvents();
  t.snapshot(
    {
      status: rec?.status,
      hasCanceledAt: !!rec?.canceledAt,
      activatedCount,
      canceledCount,
    },
    'should keep active until period end when will_renew is false'
  );
});

test('should retain record as past_due (inactive but not expired) and NOT emit canceled event', async t => {
  const { db, collectEvents, mockAlias, mockSub, triggerWebhook } = t.context;
  mockAlias(user.id);
  mockSub([
    {
      identifier: 'Pro',
      isTrial: false,
      isActive: false,
      latestPurchaseDate: new Date('2025-05-01T00:00:00.000Z'),
      expirationDate: new Date('2999-01-01T00:00:00.000Z'),
      productId: 'app.affine.pro.Annual',
      store: 'app_store',
      willRenew: true,
      duration: null,
    },
  ]);
  await triggerWebhook(user.id, {
    id: 'evt_pastdue',
    type: 'BILLING_ISSUE',
    store: 'app_store',
  });

  const rec = await db.providerSubscription.findFirst({
    where: { targetType: 'user', targetId: user.id, plan: 'pro' },
    select: { status: true },
  });
  const { canceledCount } = collectEvents();
  t.snapshot(
    { status: rec?.status, canceledCount },
    'should retain past_due record and NOT emit canceled event'
  );
});

test('should block checkout when an existing subscription of the same plan is active', async t => {
  const { module, db } = t.context;

  const manager = module.get(UserSubscriptionManager);
  let subscriptionId: string;

  {
    const subscription = await db.providerSubscription.create({
      data: {
        targetType: 'user',
        targetId: user.id,
        plan: 'pro',
        status: 'active',
        provider: 'revenuecat',
        recurring: 'monthly',
        periodStart: new Date('2025-01-01T00:00:00.000Z'),
        iapStore: 'app_store',
        externalCustomerId: 'cust',
        externalProductId: 'app.affine.pro.Monthly',
        externalRef: 'rc:app.affine.pro.Monthly',
      },
    });
    subscriptionId = subscription.id;

    await t.throwsAsync(
      manager.checkout(
        {
          plan: SubscriptionPlan.Pro,
          recurring: SubscriptionRecurring.Monthly,
          variant: null,
        },
        {
          successCallbackLink: '/',
          plan: SubscriptionPlan.Pro,
          recurring: SubscriptionRecurring.Monthly,
        },
        { user: { id: user.id, email: user.email } }
      ),
      { instanceOf: ManagedByAppStoreOrPlay }
    );
  }

  {
    await db.providerSubscription.update({
      where: { id: subscriptionId },
      data: {
        provider: 'stripe',
        externalSubscriptionId: 'sub_existing',
        iapStore: null,
        externalCustomerId: null,
        externalProductId: null,
        externalRef: null,
      },
    });

    await t.throwsAsync(
      () =>
        manager.checkout(
          {
            plan: SubscriptionPlan.Pro,
            recurring: SubscriptionRecurring.Monthly,
            variant: null,
          },
          {
            successCallbackLink: '/',
            plan: SubscriptionPlan.Pro,
            recurring: SubscriptionRecurring.Monthly,
          },
          { user: { id: user.id, email: user.email } }
        ),
      { instanceOf: SubscriptionAlreadyExists }
    );
  }
});

test('should skip RC upsert when Stripe active already exists for same plan', async t => {
  const { db, collectEvents, mockAlias, mockSub, triggerWebhook } = t.context;
  mockAlias(user.id);
  await db.providerSubscription.create({
    data: {
      targetType: 'user',
      targetId: user.id,
      plan: 'pro',
      status: 'active',
      provider: 'stripe',
      recurring: 'monthly',
      periodStart: new Date('2025-01-01T00:00:00.000Z'),
      externalSubscriptionId: 'sub_conflict',
    },
  });
  mockSub([
    {
      identifier: 'Pro',
      isTrial: false,
      isActive: true,
      latestPurchaseDate: new Date('2025-06-01T00:00:00.000Z'),
      expirationDate: new Date('2025-07-01T00:00:00.000Z'),
      productId: 'app.affine.pro.Monthly',
      store: 'app_store',
      willRenew: true,
      duration: null,
    },
  ]);

  await triggerWebhook(user.id, {
    id: 'evt_conflict',
    type: 'INITIAL_PURCHASE',
    store: 'app_store',
  });

  const rcRec = await db.providerSubscription.findFirst({
    where: { targetId: user.id, plan: 'pro', provider: 'revenuecat' },
  });
  const { activatedCount } = collectEvents();
  t.snapshot(
    { hasRCRecord: !!rcRec, activatedCount },
    'should skip RC upsert when Stripe active already exists'
  );
});

test('should block read-write ops on revenuecat-managed record (cancel/resume/updateRecurring)', async t => {
  const { db, service } = t.context;
  await db.providerSubscription.create({
    data: {
      targetType: 'user',
      targetId: user.id,
      plan: 'pro',
      status: 'active',
      provider: 'revenuecat',
      recurring: 'monthly',
      periodStart: new Date(),
      iapStore: 'app_store',
      externalCustomerId: 'cust',
      externalProductId: 'app.affine.pro.Monthly',
      externalRef: 'rc:managed',
    },
  });

  const expectManaged = async (fn: () => Promise<unknown>) =>
    t.throwsAsync(() => fn(), { instanceOf: ManagedByAppStoreOrPlay });

  await expectManaged(() =>
    service.cancelSubscription({ plan: SubscriptionPlan.Pro, userId: user.id })
  );

  await expectManaged(() =>
    service.resumeSubscription({ plan: SubscriptionPlan.Pro, userId: user.id })
  );

  await expectManaged(() =>
    service.updateSubscriptionRecurring(
      { plan: SubscriptionPlan.Pro, userId: user.id },
      SubscriptionRecurring.Yearly
    )
  );
});

test('should reconcile and fix missing or out-of-order states for revenuecat Active/Trialing/PastDue records', async t => {
  const { webhook, db, collectEvents, mockAlias, mockSubSeq } = t.context;

  mockAlias(user.id);
  const placeholder = await db.providerSubscription.create({
    data: {
      targetType: 'user',
      targetId: user.id,
      plan: 'pro',
      status: 'active',
      provider: 'revenuecat',
      recurring: 'yearly',
      periodStart: new Date('2025-01-01T00:00:00.000Z'),
      periodEnd: new Date('2999-01-01T00:00:00.000Z'),
      iapStore: 'app_store',
      externalCustomerId: user.id,
      externalProductId: 'legacy_product:1',
      externalRef: 'legacy_subscription:1',
      metadata: { legacyRevenueCatIdentityIncomplete: true },
    },
  });
  const subscription = {
    identifier: 'Pro',
    isTrial: false,
    isActive: true,
    latestPurchaseDate: new Date('2025-03-01T00:00:00.000Z'),
    expirationDate: new Date('2026-03-01T00:00:00.000Z'),
    productId: 'app.affine.pro.Annual',
    store: 'play_store',
    willRenew: true,
    duration: null,
  } as const;
  const subscriber = mockSubSeq([[subscription], [subscription]]);

  await webhook.syncAppUser(user.id);
  await db.providerSubscription.create({
    data: {
      targetType: 'user',
      targetId: user.id,
      plan: 'pro',
      status: 'active',
      provider: 'revenuecat',
      recurring: 'yearly',
      periodEnd: new Date('2999-01-01T00:00:00.000Z'),
      iapStore: 'app_store',
      externalCustomerId: user.id,
      externalProductId: 'legacy_product:2',
      externalRef: 'legacy_subscription:2',
      metadata: { legacyRevenueCatIdentityIncomplete: true },
    },
  });
  await webhook.syncAppUser(user.id);
  const { activatedCount, canceledCount } = collectEvents();
  const subscriberCount = subscriber.getCalls()?.length || 0;
  const records = await db.providerSubscription.findMany({
    where: { targetId: user.id, plan: 'pro', provider: 'revenuecat' },
    select: { id: true, externalRef: true, metadata: true },
  });
  const normalizedRecords = records.map(({ id: _, ...record }) => record);
  const activeEntitlement = await db.entitlement.findFirst({
    where: {
      targetType: 'user',
      targetId: user.id,
      source: 'cloud_subscription',
      status: 'active',
      subjectId: placeholder.id,
    },
  });

  t.snapshot(
    {
      subscriberCount,
      activatedCount,
      canceledCount,
      records: normalizedRecords,
      reusedPlaceholder: records[0]?.id === placeholder.id,
      hasActiveEntitlement: !!activeEntitlement,
    },
    'should reconcile and fix missing or out-of-order states for revenuecat records'
  );
});

test('should treat refund as early expiration and revoke immediately', async t => {
  const { db, collectEvents, mockAlias, mockSub, triggerWebhook } = t.context;

  mockAlias(user.id);
  await db.providerSubscription.create({
    data: {
      targetType: 'user',
      targetId: user.id,
      plan: 'pro',
      status: 'active',
      provider: 'revenuecat',
      recurring: 'monthly',
      periodStart: new Date('2025-01-01T00:00:00.000Z'),
      iapStore: 'app_store',
      externalCustomerId: 'cust',
      externalProductId: 'app.affine.pro.Monthly',
      externalRef: 'rc:app.affine.pro.Monthly',
    },
  });

  mockSub([
    {
      identifier: 'Pro',
      isTrial: false,
      isActive: false,
      latestPurchaseDate: new Date('2025-01-01T00:00:00.000Z'),
      expirationDate: new Date('2025-01-15T00:00:00.000Z'),
      productId: 'app.affine.pro.Monthly',
      store: 'app_store',
      willRenew: false,
      duration: null,
    },
  ]);

  await triggerWebhook(user.id, {
    id: 'evt_refund',
    type: 'CANCELLATION',
    store: 'app_store',
  });

  const count = await db.providerSubscription.count({
    where: { targetId: user.id, plan: 'pro' },
  });
  const { canceledCount } = collectEvents();
  t.snapshot(
    { finalDBCount: count, canceledEventCount: canceledCount },
    'should cancel record and emit canceled on refund'
  );
});

test('should ignore non-whitelisted productId and not write to DB', async t => {
  const { db, collectEvents, mockAlias, mockSub, triggerWebhook } = t.context;

  mockAlias(user.id);
  mockSub([
    {
      identifier: 'Weird',
      isTrial: false,
      isActive: true,
      latestPurchaseDate: new Date('2025-07-01T00:00:00.000Z'),
      expirationDate: new Date('2026-07-01T00:00:00.000Z'),
      productId: 'unknown.sku',
      store: 'app_store',
      willRenew: true,
      duration: null,
    },
  ]);
  await triggerWebhook(user.id, {
    id: 'evt_unknown',
    type: 'INITIAL_PURCHASE',
    store: 'app_store',
  });
  const dbCount = await db.providerSubscription.count({
    where: { targetId: user.id },
  });
  const { activatedCount, canceledCount } = collectEvents();
  t.snapshot(
    { dbCount, activatedCount, canceledCount },
    'should ignore non-whitelisted productId and not write to DB'
  );
});

test('should map via entitlement+duration when productId not whitelisted (P1M/P1Y only)', async t => {
  const { db, collectEvents, mockAlias, mockSubSeq, triggerWebhook } =
    t.context;

  mockAlias(user.id);
  const Pro = {
    identifier: 'Pro',
    isTrial: false,
    isActive: true,
    latestPurchaseDate: new Date('2025-08-01T00:00:00.000Z'),
    expirationDate: new Date('2025-09-01T00:00:00.000Z'),
    productId: 'app.affine.pro.Monthly',
    store: 'app_store',
    willRenew: true,
    duration: 'P1M',
  } as const;
  const AI = {
    identifier: 'AI',
    isTrial: false,
    isActive: true,
    latestPurchaseDate: new Date('2025-10-01T00:00:00.000Z'),
    expirationDate: new Date('2026-10-01T00:00:00.000Z'),
    productId: 'app.affine.pro.ai.Annual',
    store: 'play_store',
    willRenew: true,
    duration: 'P1Y',
  } as const;
  const Unsupported = {
    identifier: 'Pro',
    isTrial: false,
    isActive: true,
    latestPurchaseDate: new Date('2025-11-01T00:00:00.000Z'),
    expirationDate: new Date('2026-02-01T00:00:00.000Z'),
    productId: 'app.affine.pro.Quarterly',
    store: 'app_store',
    willRenew: true,
    duration: 'P3M', // not supported -> ignore
  } as const;

  mockSubSeq([[Pro], [Pro, AI], [Pro, Unsupported]]);

  // pro monthly via fallback
  await triggerWebhook(user.id, {
    id: 'evt_fb1',
    type: 'INITIAL_PURCHASE',
    store: 'app_store',
  });
  const r1 = await db.providerSubscription.findFirst({
    where: { targetType: 'user', targetId: user.id, plan: 'pro' },
    select: { plan: true, recurring: true, provider: true },
  });
  const s1 = collectEvents();

  // ai yearly via fallback
  await triggerWebhook(user.id, {
    id: 'evt_fb2',
    type: 'INITIAL_PURCHASE',
    store: 'play_store',
  });
  const r2 = await db.providerSubscription.findFirst({
    where: { targetType: 'user', targetId: user.id, plan: 'ai' },
    select: { plan: true, recurring: true, provider: true },
  });
  const s2 = collectEvents();

  // unsupported duration ignored
  await triggerWebhook(user.id, {
    id: 'evt_fb3',
    type: 'INITIAL_PURCHASE',
    store: 'app_store',
  });
  const count = await db.providerSubscription.count({
    where: { targetId: user.id },
  });
  const s3 = collectEvents();

  t.snapshot(
    {
      proViaFallback: r1,
      aiViaFallback: r2,
      // unsupported duration ignored, count remains 1
      totalCount: count,
      eventsCounts: {
        // active pro plan, add 1 active event
        afterFirst: { a: s1.activatedCount, c: s1.canceledCount },
        // active pro and ai plans, add 2 active events
        afterSecond: { a: s2.activatedCount, c: s2.canceledCount },
        // add 2 active events, add 1 canceled events
        // cancel pro plans and ignore unsupported plan
        afterThird: { a: s3.activatedCount, c: s3.canceledCount },
      },
    },
    'should map via entitlement+duration fallback and ignore unsupported durations'
  );
});

test('should not dispatch webhook event when authorization header is missing or mismatched', async t => {
  const { controller, event } = t.context;
  const before = event.emitAsync.getCalls()?.length || 0;
  const e = { id: '42', type: 'INITIAL_PURCHASE', app_user_id: user.id };
  await controller.handleWebhook({ body: { event: e } } as any, undefined);
  const after = event.emitAsync.getCalls()?.length || 0;
  t.is(after - before, 0, 'should not emit event');
});

test('should refresh user subscriptions (empty / revenuecat / stripe-only)', async t => {
  const { subResolver, db, mockAlias, mockSubSeq } = t.context;

  mockAlias(user.id);
  const currentUser = {
    id: user.id,
    email: user.email,
    avatarUrl: '',
    name: '',
    disabled: false,
    hasPassword: true,
    emailVerified: true,
  };

  // prepare mocks:
  // first call returns Pro subscription
  // second call returns AI subscription.
  const stub = mockSubSeq([
    [
      {
        identifier: 'Pro',
        isTrial: false,
        isActive: true,
        latestPurchaseDate: new Date('2025-09-01T00:00:00.000Z'),
        expirationDate: new Date('2026-09-01T00:00:00.000Z'),
        productId: 'app.affine.pro.Annual',
        store: 'app_store',
        willRenew: true,
        duration: null,
      },
    ],
    [
      {
        identifier: 'AI',
        isTrial: false,
        isActive: true,
        latestPurchaseDate: new Date('2025-09-02T00:00:00.000Z'),
        expirationDate: new Date('2026-09-02T00:00:00.000Z'),
        productId: 'app.affine.pro.ai.Annual',
        store: 'play_store',
        willRenew: true,
        duration: null,
      },
    ],
  ]);

  // case1: empty -> should sync (first sequence)
  {
    const subs = await subResolver.refreshUserSubscriptions(currentUser);
    t.is(stub.callCount, 1, 'Scenario1: RC API called once');
    t.truthy(
      subs.find(s => s.plan === 'pro'),
      'case1: pro saved'
    );
  }

  // case2: existing revenuecat -> should sync again (second sequence)
  {
    const subs = await subResolver.refreshUserSubscriptions(currentUser);
    t.is(stub.callCount, 2, 'Scenario2: RC API called second time');
    t.truthy(
      subs.find(s => s.plan === 'ai'),
      'case2: ai saved'
    );
  }

  // case3: only stripe subscription -> should NOT sync (call count remains 2)
  {
    await db.providerSubscription.deleteMany({
      where: { targetId: user.id, provider: 'revenuecat' },
    });
    await db.providerSubscription.create({
      data: {
        targetType: 'user',
        targetId: user.id,
        plan: 'pro',
        provider: 'stripe',
        status: 'active',
        recurring: 'monthly',
        periodStart: new Date('2025-01-01T00:00:00.000Z'),
        externalSubscriptionId: 'sub_123',
      },
    });
    const subs = await subResolver.refreshUserSubscriptions(currentUser);
    t.is(stub.callCount, 2, 'case3: RC API not called again');
    t.is(subs.length, 1, 'case3: only stripe subscription returned');
  }
});

test('user subscriptions ignore active rows after their current period ended', async t => {
  const { db, subResolver } = t.context;

  await db.providerSubscription.createMany({
    data: [
      {
        targetType: 'user',
        targetId: user.id,
        plan: 'ai',
        provider: 'stripe',
        status: 'active',
        recurring: 'yearly',
        periodStart: new Date('2025-01-01T00:00:00.000Z'),
        periodEnd: new Date('2025-01-08T00:00:00.000Z'),
        externalSubscriptionId: 'sub_expired_ai',
      },
      {
        targetType: 'user',
        targetId: user.id,
        plan: 'pro',
        provider: 'stripe',
        status: 'active',
        recurring: 'yearly',
        periodStart: new Date('2025-01-01T00:00:00.000Z'),
        periodEnd: new Date('2099-01-01T00:00:00.000Z'),
        externalSubscriptionId: 'sub_current_pro',
      },
    ],
  });
  const entitlement = t.context.module.get(EntitlementService);
  await entitlement.upsertFromCloudSubscription({
    targetId: user.id,
    plan: SubscriptionPlan.AI,
    recurring: SubscriptionRecurring.Yearly,
    status: SubscriptionStatus.Active,
    subscriptionId: 'sub_expired_ai',
    end: new Date('2025-01-08T00:00:00.000Z'),
  });
  await entitlement.upsertFromCloudSubscription({
    targetId: user.id,
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Yearly,
    status: SubscriptionStatus.Active,
    subscriptionId: 'sub_current_pro',
    end: new Date('2099-01-01T00:00:00.000Z'),
  });

  const subscriptions = await subResolver.subscriptions(user, user);
  t.deepEqual(subscriptions.map(subscription => subscription.plan).sort(), [
    'pro',
  ]);

  const manager = t.context.module.get(UserSubscriptionManager);
  const activeAI = await manager.getActiveSubscription({
    userId: user.id,
    plan: SubscriptionPlan.AI,
  });
  t.is(activeAI, null);
});

test('user subscriptions preserve provider trialing status', async t => {
  const { db, models, subResolver } = t.context;
  const trialUser = await models.user.create({
    email: `${Date.now()}-trial-status@affine.pro`,
  });

  await db.providerSubscription.create({
    data: {
      provider: 'stripe',
      targetType: 'user',
      targetId: trialUser.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Yearly,
      status: SubscriptionStatus.Trialing,
      externalSubscriptionId: 'sub_trialing_status',
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEnd: new Date('2099-01-01T00:00:00.000Z'),
    },
  });
  await t.context.module.get(EntitlementService).upsertFromCloudSubscription({
    targetId: trialUser.id,
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Yearly,
    status: SubscriptionStatus.Trialing,
    subscriptionId: 'sub_trialing_status',
    end: new Date('2099-01-01T00:00:00.000Z'),
  });

  const subscriptions = await subResolver.subscriptions(trialUser, trialUser);

  t.is(subscriptions[0]?.status, SubscriptionStatus.Trialing);
});
