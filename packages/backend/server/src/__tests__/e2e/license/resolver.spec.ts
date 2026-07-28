import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { installLicenseMutation, SubscriptionVariant } from '@affine/graphql';
import { PrismaClient } from '@prisma/client';

import { Workspace, WorkspaceRole } from '../../../models';
import { LicenseService } from '../../../plugins/license/service';
import {
  SubscriptionRecurring,
  SubscriptionVariant as PaymentSubscriptionVariant,
} from '../../../plugins/payment/types';
import {
  createApp,
  e2e,
  MockedUser,
  Mockers,
  refreshEnv,
  type TestingApp,
} from '../test';

const testWorkspaceId = 'd6f52bc7-d62a-4822-804a-335fa7dfe5a6';
const testPublicKey = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqrxlczPknUuj4q4xx1VGr063Cgu7
Hc3w7v4FGmoA5MNzzhrkho1ckDYw2wrX6zBnehFzcivURv80HherE2GQjg==
-----END PUBLIC KEY-----`;
const testTestLicenseAESKey = 'TEST_LICENSE_AES_KEY';

const fixturesDir = join(import.meta.dirname, '__fixtures__');
function getLicense(file: string) {
  return new File([readFileSync(join(fixturesDir, file))], 'test-license.lic', {
    type: 'application/octet-stream',
  });
}

const licenses = {
  valid: getLicense('valid.license'),
  expired: getLicense('expired.license'),
  expiredEndAt: getLicense('expired-end-at.license'),
};

let app: TestingApp;
let workspace: Workspace;
let owner: MockedUser;

e2e.before(async () => {
  process.env.DEPLOYMENT_TYPE = 'selfhosted';
  process.env.AFFiNE_PRO_PUBLIC_KEY = testPublicKey;
  process.env.AFFiNE_PRO_LICENSE_AES_KEY = testTestLicenseAESKey;
  refreshEnv();

  app = await createApp();
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

e2e('should install file license', async t => {
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

  await app.get(LicenseService).licensesHealthCheck();

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
});

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
      message:
        'Invalid license to activate. License file has expired. Please contact with Affine support to fetch a latest one.',
    }
  );
});

e2e('should not install license with expired end date', async t => {
  await t.throwsAsync(
    app.gql({
      query: installLicenseMutation,
      variables: {
        workspaceId: workspace.id,
        license: licenses.expiredEndAt,
      },
    }),
    {
      message: 'License has expired.',
    }
  );
});
