import { createSign } from 'node:crypto';

import { installLicenseMutation, SubscriptionVariant } from '@affine/graphql';
import { PrismaClient } from '@prisma/client';
import Sinon from 'sinon';

import { EventBus } from '../../../base';
import { BackendRuntimeProvider } from '../../../core/backend-runtime';
import { Workspace, WorkspaceRole } from '../../../models';
import { LicenseService } from '../../../plugins/license/service';
import {
  SubscriptionRecurring,
  SubscriptionVariant as PaymentSubscriptionVariant,
} from '../../../plugins/payment/types';
import {
  app as sharedApp,
  createApp,
  e2e,
  MockedUser,
  Mockers,
  refreshEnv,
  type TestingApp,
} from '../test';

const testWorkspaceId = 'd6f52bc7-d62a-4822-804a-335fa7dfe5a6';
const testPrivateKey = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgsH+B50OQ7W85sBwV
Vu1OkczX+OJICAwmwCMDMBhEXB+hRANCAAQ5vAmJOZu6LuuRZ88nsujO+7LZFyWi
1ytvRXp2VLaKMoRKGbtm21PBCfTzHN6x2Nf8DGmhHlf3J+geRq4gG64x
-----END PRIVATE KEY-----`;

function getLicense(
  workspaceId: string,
  expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
) {
  const now = new Date();
  const issuedAt = new Date(
    Math.min(now.getTime(), expiresAt.getTime() - 60_000)
  );
  const claims = {
    formatVersion: 1,
    licenseId: `license:${workspaceId}`,
    workspaceId,
    audience: 'affine-selfhost',
    plan: 'selfhost_team',
    seatQuantity: 20,
    issuedAt: issuedAt.toISOString(),
    notBefore: new Date(issuedAt.getTime() - 60_000).toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const signer = createSign('SHA256');
  signer.update(JSON.stringify(claims));
  signer.end();
  const envelope = JSON.stringify({
    claims,
    signature: signer.sign(testPrivateKey).toString('base64'),
  });
  return new File([envelope], 'test-license.lic', {
    type: 'application/octet-stream',
  });
}

const licenses = {
  valid: getLicense(testWorkspaceId),
  expired: getLicense(testWorkspaceId, new Date(Date.now() - 1)),
};

let app: TestingApp;
let workspace: Workspace;
let owner: MockedUser;

e2e.before(async () => {
  await sharedApp.close();
  process.env.DEPLOYMENT_TYPE = 'selfhosted';
  refreshEnv();

  app = await createApp();
  await app.get(PrismaClient).installedLicense.deleteMany({
    where: { workspaceId: testWorkspaceId },
  });
  await app.models.workspace.delete(testWorkspaceId);
  owner = await app.signup();
  workspace = await app.create(Mockers.Workspace, {
    id: testWorkspaceId,
    owner,
  });
});

e2e.beforeEach(async () => {
  await app.login(owner);
});

e2e.after.always(async () => {
  await app.close();
});

e2e(
  'should preview without a target and install a file license for its workspace',
  async t => {
    const preview = app
      .get(LicenseService)
      .previewLicense(Buffer.from(await licenses.valid.arrayBuffer()));
    t.is(preview.workspaceId, workspace.id);
    t.true(preview.valid);
    const res = await app.gql({
      query: installLicenseMutation,
      variables: {
        workspaceId: workspace.id,
        license: licenses.valid,
      },
    });

    t.is(res.installLicense.variant, SubscriptionVariant.Onetime);

    const db = app.get(PrismaClient);
    const installed = await db.installedLicense.findUniqueOrThrow({
      where: { workspaceId: workspace.id },
    });

    const staleAt = new Date(0);
    await db.installedLicense.update({
      where: { key: installed.key },
      data: {
        quantity: installed.quantity + 10,
        recurring:
          installed.recurring === SubscriptionRecurring.Monthly
            ? SubscriptionRecurring.Yearly
            : SubscriptionRecurring.Monthly,
        validatedAt: staleAt,
        expiredAt: staleAt,
      },
    });
    await db.entitlement.updateMany({
      where: {
        source: 'selfhost_license',
        targetType: 'workspace',
        targetId: workspace.id,
      },
      data: {
        quantity: installed.quantity + 20,
        validatedAt: staleAt,
        expiresAt: staleAt,
      },
    });

    await app.get(BackendRuntimeProvider).checkLicensesV1();

    const revalidated = await db.installedLicense.findUniqueOrThrow({
      where: { key: installed.key },
    });
    t.is(revalidated.variant, PaymentSubscriptionVariant.Onetime);
    t.is(revalidated.quantity, installed.quantity);
    t.is(revalidated.recurring, installed.recurring);
    t.is(revalidated.expiredAt?.getTime(), installed.expiredAt?.getTime());
    t.true(revalidated.validatedAt.getTime() > staleAt.getTime());

    const entitlement = await db.entitlement.findFirstOrThrow({
      where: {
        source: 'selfhost_license',
        targetType: 'workspace',
        targetId: workspace.id,
      },
    });
    t.is(entitlement.quantity, installed.quantity);
    t.is(entitlement.expiresAt?.getTime(), installed.expiredAt?.getTime());
    t.true((entitlement.validatedAt?.getTime() ?? 0) > staleAt.getTime());
  }
);

e2e(
  'should commit onetime license before publishing activation event',
  async t => {
    const target = await app.create(Mockers.Workspace, { owner });
    const db = app.get(PrismaClient);
    let committed = false;
    const emitAsync = Sinon.stub(app.get(EventBus), 'emitAsync').callsFake(
      async (name, payload) => {
        if (
          name === 'workspace.subscription.activated' &&
          (payload as Events['workspace.subscription.activated'])
            .workspaceId === target.id
        ) {
          committed =
            (await db.installedLicense.count({
              where: { workspaceId: target.id },
            })) === 1 &&
            (await db.entitlement.count({
              where: { source: 'selfhost_license', targetId: target.id },
            })) === 1;
        }
        return [];
      }
    );
    t.teardown(() => emitAsync.restore());

    await app
      .get(LicenseService)
      .installLicense(
        target.id,
        Buffer.from(await getLicense(target.id).arrayBuffer())
      );
    t.true(committed);
  }
);

e2e(
  'should reject occupied workspace and key before creating activation intent',
  async t => {
    const db = app.get(PrismaClient);
    const installed = await db.installedLicense.findFirstOrThrow({
      where: { workspaceId: workspace.id },
    });
    await t.throwsAsync(
      app.get(LicenseService).activateTeamLicense(workspace.id, 'unused-key')
    );
    const target = await app.create(Mockers.Workspace, { owner });
    await t.throwsAsync(
      app.get(LicenseService).activateTeamLicense(target.id, installed.key)
    );

    t.is(
      await db.pendingLicenseDeactivation.count({
        where: {
          OR: [{ workspaceId: workspace.id }, { workspaceId: target.id }],
        },
      }),
      0
    );
  }
);

e2e('should not allow to install license if not owner', async t => {
  const user = await app.signup();
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: user.id,
    type: WorkspaceRole.Collaborator,
  });

  await t.throwsAsync(
    app.gql({
      query: installLicenseMutation,
      variables: {
        workspaceId: workspace.id,
        license: licenses.valid,
      },
    }),
    {
      message: `You do not have permission to access Space ${workspace.id}.`,
    }
  );
});

e2e(`should not install other workspace's license file`, async t => {
  const owner = await app.signup();
  const workspace = await app.create(Mockers.Workspace, {
    owner,
  });

  await t.throwsAsync(
    app.gql({
      query: installLicenseMutation,
      variables: {
        workspaceId: workspace.id,
        license: licenses.valid,
      },
    }),
    {
      message:
        'Invalid license to activate. Workspace mismatched with license.',
    }
  );
});

e2e('should not install expired license', async t => {
  await t.throwsAsync(
    app.gql({
      query: installLicenseMutation,
      variables: {
        workspaceId: workspace.id,
        license: licenses.expired,
      },
    }),
    {
      message: 'Invalid license to activate. license expired',
    }
  );
});
