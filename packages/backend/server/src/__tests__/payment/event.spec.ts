import ava from 'ava';
import Sinon from 'sinon';

import type { Config } from '../../base';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { WorkspaceService } from '../../core/workspaces';
import type { Models } from '../../models';
import { StripeWebhookController } from '../../plugins/payment/controller';
import { PaymentEventHandlers } from '../../plugins/payment/event';
import { LicenseController } from '../../plugins/payment/license-controller';
import { RevenueCatWebhookController } from '../../plugins/payment/revenuecat-controller';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
} from '../../plugins/payment/types';

ava('payment HTTP and event adapters only forward protocol data', async t => {
  const runtime = Sinon.createStubInstance(BackendRuntimeProvider);
  const execute = runtime.executePaymentCommandV1 as Sinon.SinonStub;
  const capture = runtime.capturePaymentWebhookV1 as Sinon.SinonStub;
  const workspace = Sinon.createStubInstance(WorkspaceService);
  const config = {
    payment: { enabled: true, stripe: { apiKey: 'sk_test_protocol' } },
  } as Config;
  const models = {
    workspaceUser: {
      chargedCount: Sinon.stub().resolves(3),
      getOwner: Sinon.stub().resolves({ id: 'owner-1' }),
    },
  } as unknown as Models;
  const events = new PaymentEventHandlers(workspace, runtime, config, models);

  execute.resolves({ status: 'pending' });
  await events.prepareSubscriptionCancellation({ id: 'user-1' });
  t.deepEqual(execute.lastCall.args, [
    { action: 'prepare_user_deletion', userId: 'user-1' },
  ]);
  await events.updateTeamSubscriptionQuantity({ workspaceId: 'workspace-1' });
  t.like(execute.lastCall.args[0], {
    action: 'update_quantity',
    actorUserId: 'owner-1',
    targetType: 'workspace',
    targetId: 'workspace-1',
    plan: 'team',
    quantity: 3,
  });

  workspace.isTeamWorkspace.resolves(false);
  workspace.sendTeamWorkspaceUpgradedEmail.resolves();
  await events.onWorkspaceSubscriptionUpdated({
    workspaceId: 'workspace-1',
    plan: SubscriptionPlan.Team,
    recurring: SubscriptionRecurring.Yearly,
    quantity: 4,
  });
  t.true(
    workspace.sendTeamWorkspaceUpgradedEmail.calledOnceWith('workspace-1')
  );

  capture.resolves({ status: 'pending' });
  const stripe = new StripeWebhookController(runtime);
  t.deepEqual(
    await stripe.handleWebhook({
      rawBody: Buffer.from('{"id":"evt_1"}'),
      headers: { 'stripe-signature': 'stripe-signature' },
    } as never),
    { status: 'pending' }
  );
  t.deepEqual(capture.lastCall.args, [
    'stripe',
    Buffer.from('{"id":"evt_1"}'),
    'stripe-signature',
  ]);

  const revenuecat = new RevenueCatWebhookController(runtime);
  await revenuecat.handleWebhook({
    rawBody: Buffer.from('{"event":{"id":"rc_1"}}'),
    headers: { authorization: 'Bearer revenuecat' },
  } as never);
  t.deepEqual(capture.lastCall.args, [
    'revenuecat',
    Buffer.from('{"event":{"id":"rc_1"}}'),
    'Bearer revenuecat',
  ]);

  execute.resolves({
    license: Buffer.from('signed-license').toString('base64'),
    validateKey: 'validate-key',
    recurring: 'yearly',
  });
  const response = {
    status: Sinon.stub().returnsThis(),
    header: Sinon.stub().returnsThis(),
    send: Sinon.stub().returnsThis(),
  };
  const licenses = new LicenseController(runtime);
  await licenses.activate(response as never, 'license-key', {
    workspaceId: 'remote-workspace',
    operationId: 'ac8f50e4-6113-4a1e-b46e-0c0a3f99e1cf',
  });
  t.true(response.status.calledWith(200));
  t.true(response.header.calledWith('x-next-validate-key', 'validate-key'));
  t.true(response.header.calledWith('x-license-recurring', 'yearly'));
  t.deepEqual(response.send.lastCall.args, [Buffer.from('signed-license')]);

  const licensePortal =
    runtime.createLicenseCustomerPortalV1 as Sinon.SinonStub;
  licensePortal.resolves('https://billing.example/license-portal');
  t.deepEqual(
    await licenses.createCustomerPortal(
      'license-key',
      'b7afc067-12ec-4018-9cc4-23bb4e57e0df'
    ),
    { url: 'https://billing.example/license-portal' }
  );
  t.deepEqual(licensePortal.lastCall.args, [
    'license-key',
    'b7afc067-12ec-4018-9cc4-23bb4e57e0df',
  ]);
});
