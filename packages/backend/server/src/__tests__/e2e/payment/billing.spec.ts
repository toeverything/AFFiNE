import assert from 'node:assert';

import {
  AdminPaymentPlanFamily,
  adminPaymentReconciliationQuery,
  AdminPaymentResolutionStatus,
  getWorkspacesQuery,
  getWorkspaceSubscriptionQuery,
  reconcileAdminPaymentMutation,
  refreshSubscriptionMutation,
  SubscriptionPlan,
  subscriptionQuery,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '@affine/graphql';
import { PrismaClient } from '@prisma/client';
import { getOperationAST, Kind, parse, print, visit } from 'graphql';
import Sinon from 'sinon';

import { AccessDenied, ActionForbidden } from '../../../base';
import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import { app, e2e, Mockers } from '../test';

e2e.serial(
  'billing reads one canonical Native snapshot and keeps legacy results',
  async t => {
    const owner = await app.signup();
    const member = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    await app.create(Mockers.WorkspaceUser, {
      userId: member.id,
      workspaceId: workspace.id,
    });
    const db = app.get(PrismaClient);
    const periodStart = new Date(Date.now() - 60_000);
    const providerNamespace = 'payment:v1:stripe:test:16:acct_billing_e2e';
    const sourceIdentity = `sub_${owner.id}`;
    const subscription = await db.providerSubscription.create({
      data: {
        provider: 'stripe',
        providerNamespace,
        sourceIdentity,
        externalSubscriptionId: sourceIdentity,
        targetType: 'user',
        targetId: owner.id,
        plan: 'pro',
        recurring: 'monthly',
        status: 'active',
        periodStart,
      },
    });
    const entitlement = await db.entitlement.create({
      data: {
        targetType: 'user',
        targetId: owner.id,
        source: 'cloud_subscription',
        plan: 'pro',
        status: 'active',
        startsAt: periodStart,
        metadata: { providerSubscriptionId: subscription.id },
      },
    });
    await db.cloudSubscriptionBinding.createMany({
      data: [
        {
          userId: owner.id,
          planFamily: 'pro',
          boundProviderNamespace: providerNamespace,
          boundSourceIdentity: sourceIdentity,
        },
        { userId: owner.id, planFamily: 'ai', conflicted: true },
      ],
    });
    const runtime = app.get(BackendRuntimeProvider);
    const list = Sinon.spy(runtime, 'listPaymentSubscriptionsV1');
    t.teardown(async () => {
      list.restore();
      await db.cloudSubscriptionBinding.deleteMany({
        where: { userId: owner.id },
      });
      await db.entitlement.delete({ where: { id: entitlement.id } });
      await db.providerSubscription.delete({ where: { id: subscription.id } });
    });

    const subscriptions = [
      {
        id: sourceIdentity,
        status: SubscriptionStatus.Active,
        plan: SubscriptionPlan.Pro,
        recurring: SubscriptionRecurring.Monthly,
        start: periodStart.toISOString(),
        end: null,
        nextBillAt: null,
        canceledAt: null,
        variant: null,
      },
    ];
    t.deepEqual(await app.gql({ query: subscriptionQuery }), {
      currentUser: {
        id: owner.id,
        subscriptionBilling: {
          subscriptions: subscriptions.map(subscription => ({
            ...subscription,
            provider: 'stripe',
            iapStore: null,
          })),
          conflicts: [{ plan: SubscriptionPlan.AI, sources: [] }],
          manageable: [],
        },
      },
    });
    t.true(list.calledOnceWithExactly('user', owner.id));

    const billingDocument = parse(subscriptionQuery.query);
    const legacyQuery = {
      ...subscriptionQuery,
      query: print(
        visit(billingDocument, {
          Field(node) {
            if (
              node.name.value === 'provider' ||
              node.name.value === 'iapStore'
            ) {
              return null;
            }
            if (node.name.value === 'subscriptionBilling') {
              return node.selectionSet?.selections.find(
                selection =>
                  selection.kind === Kind.FIELD &&
                  selection.name.value === 'subscriptions'
              );
            }
            return;
          },
        })
      ),
    };
    const legacyResult: unknown = await app.gql({ query: legacyQuery });
    t.deepEqual(legacyResult, {
      currentUser: { id: owner.id, subscriptions },
    });
    t.deepEqual(await app.gql({ query: refreshSubscriptionMutation }), {
      refreshUserSubscriptions: subscriptions,
    });
    t.is(list.callCount, 2);

    await app.login(member);
    const [currentUser] =
      getOperationAST(billingDocument)?.selectionSet.selections ?? [];
    assert(currentUser?.kind === Kind.FIELD);
    const owners = visit(parse(getWorkspacesQuery.query), {
      Field(node) {
        if (node.name.value === 'owner') {
          return { ...node, selectionSet: currentUser.selectionSet };
        }
        return;
      },
    });
    await t.throwsAsync(
      app.gql({
        query: {
          ...getWorkspacesQuery,
          query: print(owners),
        },
      }),
      { message: new AccessDenied().message }
    );
    await t.throwsAsync(
      app.gql({
        query: getWorkspaceSubscriptionQuery,
        variables: { workspaceId: workspace.id },
      })
    );
    t.deepEqual(await app.gql({ query: subscriptionQuery }), {
      currentUser: {
        id: member.id,
        subscriptionBilling: {
          subscriptions: [],
          conflicts: [],
          manageable: [],
        },
      },
    });
    t.true(list.lastCall.calledWithExactly('user', member.id));
    t.is(list.callCount, 3);

    app.clearAuth();
    t.deepEqual(await app.gql({ query: subscriptionQuery }), {
      currentUser: null,
    });
    t.is(list.callCount, 3);
  }
);

e2e.serial(
  'payment reconciliation requires a cloud admin and uses the authenticated actor',
  async t => {
    const user = await app.signup();
    const admin = await app.create(Mockers.User, { feature: 'administrator' });
    const command = Sinon.stub(
      app.get(BackendRuntimeProvider),
      'executePaymentCommandV1'
    );
    const deployment = Sinon.stub(env, 'selfhosted').get(() => false);
    t.teardown(() => {
      command.restore();
      deployment.restore();
    });

    const input = {
      userId: user.id,
      planFamily: AdminPaymentPlanFamily.Pro,
      requestId: 'payment-reconciliation-e2e',
      evidence: '  Provider support confirmed the refund.  ',
    };
    const inspect = () =>
      app.gql({
        query: adminPaymentReconciliationQuery,
        variables: { input: { providerIdentity: 'cus_payment_review' } },
      });
    const reconcile = () =>
      app.gql({
        query: reconcileAdminPaymentMutation,
        variables: { input },
      });

    const forbidden = { message: new ActionForbidden().message };
    await t.throwsAsync(inspect, forbidden);
    await t.throwsAsync(reconcile, forbidden);
    t.false(command.called);

    await app.login(admin);
    deployment.get(() => true);
    await t.throwsAsync(inspect);
    await t.throwsAsync(reconcile);
    t.false(command.called);
    deployment.get(() => false);

    command.resolves({ cases: [] });
    t.deepEqual((await inspect()).adminPaymentReconciliation, []);
    t.deepEqual(command.lastCall.args[0], {
      action: 'inspect_payment_reconciliation',
      providerIdentity: 'cus_payment_review',
    });

    command.resolves({
      requestId: input.requestId,
      status: 'pending',
      reason: 'provider_unverified',
      userId: user.id,
      planFamily: 'pro',
      conflicted: true,
    });
    const response = await reconcile();
    t.is(
      response.reconcileAdminPayment.status,
      AdminPaymentResolutionStatus.Pending
    );
    t.is(response.reconcileAdminPayment.reason, 'provider_unverified');
    t.deepEqual(command.lastCall.args[0], {
      action: 'reconcile_payment',
      actorUserId: admin.id,
      userId: user.id,
      planFamily: 'pro',
      requestId: input.requestId,
      evidence: input.evidence.trim(),
    });
  }
);
