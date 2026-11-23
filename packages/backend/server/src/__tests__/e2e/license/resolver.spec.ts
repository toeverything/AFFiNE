import { installLicenseMutation, SubscriptionVariant } from '@affine/graphql';
import Sinon from 'sinon';

import { EventBus } from '../../../base';
import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import { WorkspaceRole } from '../../../models';
import { LicenseService } from '../../../plugins/license/service';
import {
  app as sharedApp,
  createApp,
  e2e,
  MockedUser,
  Mockers,
  refreshEnv,
  type TestingApp,
} from '../test';

let app: TestingApp;
let owner: MockedUser;

e2e.before(async () => {
  await sharedApp.close();
  process.env.DEPLOYMENT_TYPE = 'selfhosted';
  refreshEnv();
  app = await createApp();
  owner = await app.signup();
});

e2e.beforeEach(async () => {
  await app.login(owner);
});

e2e.after.always(async () => {
  await app.close();
});

e2e(
  'license upload maps native output and publishes only after completion',
  async t => {
    const workspace = await app.create(Mockers.Workspace, { owner });
    const bytes = Buffer.from('opaque license upload');
    const installed = {
      workspaceId: workspace.id,
      key: 'license-key',
      validateKey: 'generation',
      quantity: 20,
      recurring: 'lifetime',
      variant: 'onetime',
      installedAt: '2026-09-08T00:00:00.000Z',
      validatedAt: '2026-09-08T00:00:00.000Z',
      expiredAt: '2027-09-08T00:00:00.000Z',
      license: bytes,
    };
    const install = Sinon.stub(
      app.get(BackendRuntimeProvider),
      'installTeamLicenseFileV1'
    );
    const emit = Sinon.stub(app.get(EventBus), 'emitAsync').resolves([]);
    t.teardown(() => {
      install.restore();
      emit.restore();
    });
    let complete!: (value: typeof installed) => void;
    install.returns(
      new Promise(resolve => {
        complete = resolve;
      })
    );
    const pending = app.get(LicenseService).installLicense(workspace.id, bytes);
    t.false(emit.called);
    complete(installed);
    await pending;
    t.true(emit.calledOnce);
    t.like(emit.firstCall.args[1], {
      workspaceId: workspace.id,
      quantity: 20,
      recurring: 'lifetime',
    });

    install.resetHistory();
    install.resolves(installed);
    const result = await app.gql({
      query: installLicenseMutation,
      variables: {
        workspaceId: workspace.id,
        license: new File([bytes], 'license.lic'),
      },
    });
    t.deepEqual(install.lastCall.args, [workspace.id, bytes]);
    t.is(result.installLicense.variant, SubscriptionVariant.Onetime);
    t.is(result.installLicense.quantity, installed.quantity);
    t.is(result.installLicense.expiredAt, installed.expiredAt);
  }
);

e2e(
  'license upload enforces payment permission before invoking native',
  async t => {
    const workspace = await app.create(Mockers.Workspace, { owner });
    const user = await app.signup();
    await app.create(Mockers.WorkspaceUser, {
      workspaceId: workspace.id,
      userId: user.id,
      type: WorkspaceRole.Collaborator,
    });
    const install = Sinon.stub(
      app.get(BackendRuntimeProvider),
      'installTeamLicenseFileV1'
    );
    t.teardown(() => install.restore());
    await t.throwsAsync(
      app.gql({
        query: installLicenseMutation,
        variables: {
          workspaceId: workspace.id,
          license: new File(['opaque'], 'license.lic'),
        },
      }),
      { message: `You do not have permission to access Space ${workspace.id}.` }
    );
    t.false(install.called);
  }
);

e2e(
  'license upload translates native errors without publishing activation',
  async t => {
    const workspace = await app.create(Mockers.Workspace, { owner });
    const install = Sinon.stub(
      app.get(BackendRuntimeProvider),
      'installTeamLicenseFileV1'
    );
    const emit = Sinon.stub(app.get(EventBus), 'emitAsync').resolves([]);
    t.teardown(() => {
      install.restore();
      emit.restore();
    });
    for (const [code, message] of [
      [
        'license_workspace_mismatch',
        'Invalid license to activate. Workspace mismatched with license.',
      ],
      ['license_expired', 'Invalid license to activate. license expired'],
    ]) {
      install.rejects(new Error(code));
      await t.throwsAsync(
        app.gql({
          query: installLicenseMutation,
          variables: {
            workspaceId: workspace.id,
            license: new File(['opaque'], 'license.lic'),
          },
        }),
        { message }
      );
    }
    t.false(emit.calledWith('workspace.subscription.activated'));
  }
);

e2e(
  'license HTTP routes keep the published protocol separate from signed requests',
  async t => {
    const runtime = app.get(BackendRuntimeProvider);
    const command = Sinon.stub(runtime, 'executePaymentCommandV1');
    const portal = Sinon.stub(
      runtime,
      'createLicenseCustomerPortalV1'
    ).resolves('https://billing.example/renew');
    t.teardown(() => {
      command.restore();
      portal.restore();
    });
    const generation = 'ac8f50e4-6113-4a1e-b46e-0c0a3f99e1cf';
    const legacy = {
      plan: 'selfhostedteam',
      recurring: 'monthly',
      quantity: 10,
      endAt: 2_000_000_000_000,
    };
    command.resolves({ validateKey: generation, license: legacy });
    for (const endpoint of ['activate', 'health']) {
      const request =
        endpoint === 'activate'
          ? app.POST('/api/team/licenses/key/activate')
          : app
              .GET('/api/team/licenses/key/health')
              .set('x-validate-key', generation);
      const response = await request.expect(200);
      t.deepEqual(response.body, legacy);
      t.is(response.headers['x-next-validate-key'], generation);
      t.like(command.lastCall.args[0], {
        action:
          endpoint === 'activate'
            ? 'activate_legacy_license'
            : 'check_legacy_license_health',
        licenseKey: 'key',
      });
    }
    const bytes = Buffer.from('opaque signed envelope');
    command.resolves({
      license: bytes.toString('base64'),
      validateKey: generation,
      recurring: 'monthly',
    });
    const signed = await app
      .POST('/api/team/v1/licenses/key/health')
      .set('x-validate-key', generation)
      .send({ workspaceId: 'workspace' })
      .expect(200);
    t.deepEqual(signed.body, bytes);
    t.deepEqual(command.lastCall.args[0], {
      action: 'check_license_health',
      licenseKey: 'key',
      validateKey: generation,
      workspaceId: 'workspace',
    });
    t.is(signed.headers['x-license-recurring'], 'monthly');
    await app
      .POST('/api/team/v1/licenses/key/activate')
      .send({ workspaceId: 'workspace', operationId: generation })
      .expect(200);
    t.deepEqual(command.lastCall.args[0], {
      action: 'activate_license',
      licenseKey: 'key',
      workspaceId: 'workspace',
      operationId: generation,
    });
    for (const version of ['', '/v1']) {
      for (const endpoint of ['seats', 'recurring']) {
        command.resolves({ status: 'pending' });
        const request = app.POST(
          `/api/team${version}/licenses/key/${endpoint}`
        );
        if (version) request.set('x-validate-key', generation);
        await request
          .send(endpoint === 'seats' ? { seats: 12 } : { recurring: 'yearly' })
          .expect(201);
        t.is(
          command.lastCall.args[0].validateKey,
          version ? generation : undefined
        );
      }
      const request = app.POST(
        `/api/team${version}/licenses/key/create-customer-portal`
      );
      if (version) request.set('x-validate-key', generation);
      const response = await request.expect(201);
      t.deepEqual(response.body, { url: 'https://billing.example/renew' });
      t.is(portal.lastCall.args[1], version ? generation : undefined);
      const deactivate = app.POST(
        `/api/team${version}/licenses/key/deactivate`
      );
      if (version) deactivate.set('x-validate-key', generation);
      await deactivate.expect(201);
      t.like(command.lastCall.args[0], {
        action: version ? 'deactivate_license' : 'deactivate_legacy_license',
        licenseKey: 'key',
      });
      t.is(
        command.lastCall.args[0].validateKey,
        version ? generation : undefined
      );
    }
    for (const reason of [
      'payment_busy',
      'license_private_key_missing',
      'database unavailable',
    ]) {
      command.rejects(new Error(reason));
      for (const version of ['', '/v1']) {
        const request = version
          ? app
              .POST('/api/team/v1/licenses/key/health')
              .send({ workspaceId: 'workspace' })
          : app.GET('/api/team/licenses/key/health');
        const response = await request
          .set('x-validate-key', generation)
          .expect(500);
        t.is(response.body.name, 'INTERNAL_SERVER_ERROR');
      }
    }
    command.rejects(new Error('license_expired'));
    const expired = await app
      .POST('/api/team/v1/licenses/key/health')
      .set('x-validate-key', generation)
      .send({ workspaceId: 'workspace' })
      .expect(400);
    t.is(expired.body.name, 'LICENSE_EXPIRED');
    command.rejects(new Error('same_subscription_recurring'));
    const unchanged = await app
      .POST('/api/team/v1/licenses/key/recurring')
      .set('x-validate-key', generation)
      .send({ recurring: 'monthly' })
      .expect(400);
    t.is(unchanged.body.name, 'INVALID_LICENSE_UPDATE_PARAMS');
    command.resetHistory();
    await app.POST('/api/team/v1/licenses/key/deactivate').expect(400);
    t.false(command.called);
  }
);
