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
      subs.map(s => ({ ...s, customerId: customerId }))
    );
  t.context.mockSubSeq = sequences => {
    const stub = Sinon.stub(rc, 'getSubscriptions');
    sequences.forEach((seq, idx) => {
      const subs = seq.map(s => ({ ...s, customerId: customerId }));
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

  mockAlias(user.id);
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

  const record = await t.context.db.subscription.findUnique({
    where: { targetId_plan: { targetId: user.id, plan: 'pro' } },
    select: {
      provider: true,
      iapStore: true,
      rcEntitlement: true,
      rcProductId: true,
      rcExternalRef: true,
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
});

test('should process expiration/refund by deleting subscription and emitting canceled', async t => {
  const { db, collectEvents, mockAlias, mockSub, triggerWebhook } = t.context;

  mockAlias(user.id);
  await db.subscription.create({
    data: {
      targetId: user.id,
      plan: 'pro',
      status: 'active',
      provider: 'revenuecat',
      recurring: 'yearly',
      start: new Date('2025-01-01T00:00:00.000Z'),
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

  const finalDBCount = await db.subscription.count({
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

  const common = { provider: 'revenuecat', start: new Date() } as const;
  await db.subscription.createMany({
    data: [
      {
        targetId: 'u1',
        plan: 'pro',
        status: 'active',
        recurring: 'monthly',
        ...common,
      },
      {
        targetId: 'u2',
        plan: 'ai',
        status: 'trialing',
        recurring: 'yearly',
        ...common,
      },
      {
        targetId: 'u1',
        plan: 'ai',
        status: 'past_due',
        recurring: 'monthly',
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
    const rec = await db.subscription.findUnique({
      where: { targetId_plan: { targetId: user.id, plan: s.expectedPlan } },
      select: {
        plan: true,
        recurring: true,
        status: true,
        provider: true,
        iapStore: true,
        rcEntitlement: true,
        rcProductId: true,
        rcExternalRef: true,
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

  const rec = await db.subscription.findUnique({
    where: { targetId_plan: { targetId: user.id, plan: 'pro' } },
    select: { status: true, start: true, end: true },
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

  const finalDBCount = await db.subscription.count({
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
  const rec = await db.subscription.findUnique({
    where: { targetId_plan: { targetId: user.id, plan: 'pro' } },
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

  const rec = await db.subscription.findUnique({
    where: { targetId_plan: { targetId: user.id, plan: 'pro' } },
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

  {
    await db.subscription.create({
      data: {
        targetId: user.id,
        plan: 'pro',
        status: 'active',
        provider: 'revenuecat',
        recurring: 'monthly',
        start: new Date('2025-01-01T00:00:00.000Z'),
      },
    });

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
    await db.subscription.update({
      where: { targetId_plan: { targetId: user.id, plan: 'pro' } },
      data: { provider: 'stripe' },
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
  await db.subscription.create({
    data: {
      targetId: user.id,
      plan: 'pro',
      status: 'active',
      provider: 'stripe',
      recurring: 'monthly',
      start: new Date('2025-01-01T00:00:00.000Z'),
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

  const rcRec = await db.subscription.findFirst({
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
  await db.subscription.create({
    data: {
      targetId: user.id,
      plan: 'pro',
      status: 'active',
      provider: 'revenuecat',
      recurring: 'monthly',
      start: new Date(),
    },
  });

  // local helper used multiple times within this test
  const expectManaged = async (fn: () => Promise<any>) =>
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
  const { webhook, collectEvents, mockAlias, mockSub } = t.context;

  mockAlias(user.id);
  const subscriber = mockSub([
    {
      identifier: 'Pro',
      isTrial: false,
      isActive: true,
      latestPurchaseDate: new Date('2025-03-01T00:00:00.000Z'),
      expirationDate: new Date('2026-03-01T00:00:00.000Z'),
      productId: 'app.affine.pro.Annual',
      store: 'play_store',
      willRenew: true,
      duration: null,
    },
  ]);

  await webhook.syncAppUser(user.id);
  const { activatedCount, canceledCount } = collectEvents();
  const subscriberCount = subscriber.getCalls()?.length || 0;

  t.snapshot(
    { subscriberCount, activatedCount, canceledCount },
    'should reconcile and fix missing or out-of-order states for revenuecat records'
  );
});

test('should treat refund as early expiration and revoke immediately', async t => {
  const { db, collectEvents, mockAlias, mockSub, triggerWebhook } = t.context;

  mockAlias(user.id);
  await db.subscription.create({
    data: {
      targetId: user.id,
      plan: 'pro',
      status: 'active',
      provider: 'revenuecat',
      recurring: 'monthly',
      start: new Date('2025-01-01T00:00:00.000Z'),
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

  const count = await db.subscription.count({
    where: { targetId: user.id, plan: 'pro' },
  });
  const { canceledCount } = collectEvents();
  t.snapshot(
    { finalDBCount: count, canceledEventCount: canceledCount },
    'should delete record and emit canceled on refund'
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
  const dbCount = await db.subscription.count({ where: { targetId: user.id } });
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
  const r1 = await db.subscription.findUnique({
    where: { targetId_plan: { targetId: user.id, plan: 'pro' } },
    select: { plan: true, recurring: true, provider: true },
  });
  const s1 = collectEvents();

  // ai yearly via fallback
  await triggerWebhook(user.id, {
    id: 'evt_fb2',
    type: 'INITIAL_PURCHASE',
    store: 'play_store',
  });
  const r2 = await db.subscription.findUnique({
    where: { targetId_plan: { targetId: user.id, plan: 'ai' } },
    select: { plan: true, recurring: true, provider: true },
  });
  const s2 = collectEvents();

  // unsupported duration ignored
  await triggerWebhook(user.id, {
    id: 'evt_fb3',
    type: 'INITIAL_PURCHASE',
    store: 'app_store',
  });
  const count = await db.subscription.count({ where: { targetId: user.id } });
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
    await db.subscription.deleteMany({
      where: { targetId: user.id, provider: 'revenuecat' },
    });
    await db.subscription.create({
      data: {
        targetId: user.id,
        plan: 'pro',
        provider: 'stripe',
        status: 'active',
        recurring: 'monthly',
        start: new Date('2025-01-01T00:00:00.000Z'),
        stripeSubscriptionId: 'sub_123',
      },
    });
    const subs = await subResolver.refreshUserSubscriptions(currentUser);
    t.is(stub.callCount, 2, 'case3: RC API not called again');
    t.is(subs.length, 1, 'case3: only stripe subscription returned');
  }
});
