import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { installLicenseMutation, SubscriptionVariant } from '@affine/graphql';

import { Workspace, WorkspaceRole } from '../../../models';
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
