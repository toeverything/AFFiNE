/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Custom configurations for AFFiNE Cloud
// ====================================================================================
// Q: WHY THIS FILE EXISTS?
// A: AFFiNE deployment environment may have a lot of custom environment variables,
//    which are not suitable to be put in the `affine.ts` file.
//    For example, AFFiNE Cloud Clusters are deployed on Google Cloud Platform.
//    We need to enable the `gcloud` plugin to make sure the nodes working well,
//    but the default selfhost version may not require it.
//    So it's not a good idea to put such logic in the common `affine.ts` file.
//
//    ```
//    if (AFFiNE.deploy) {
//      AFFiNE.plugins.use('gcloud');
//    }
//    ```
// ====================================================================================
const env = process.env;

AFFiNE.metrics.enabled = !AFFiNE.node.test;

if (env.R2_OBJECT_STORAGE_ACCOUNT_ID) {
  AFFiNE.plugins.use('cloudflare-r2', {
    accountId: env.R2_OBJECT_STORAGE_ACCOUNT_ID,
    credentials: {
      accessKeyId: env.R2_OBJECT_STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_OBJECT_STORAGE_SECRET_ACCESS_KEY!,
    },
  });
  AFFiNE.storage.storages.avatar.provider = 'cloudflare-r2';
  AFFiNE.storage.storages.avatar.bucket = 'account-avatar';
  AFFiNE.storage.storages.avatar.publicLinkFactory = key =>
    `https://avatar.affineassets.com/${key}`;

  AFFiNE.storage.storages.blob.provider = 'cloudflare-r2';
  AFFiNE.storage.storages.blob.bucket = `workspace-blobs-${
    AFFiNE.affine.canary ? 'canary' : 'prod'
  }`;
}

AFFiNE.plugins.use('redis');
AFFiNE.plugins.use('payment');
AFFiNE.plugins.use('oauth');

if (AFFiNE.deploy) {
  AFFiNE.mailer = {
    service: 'gmail',
    auth: {
      user: env.MAILER_USER,
      pass: env.MAILER_PASSWORD,
    },
  };

  AFFiNE.plugins.use('gcloud');
}
