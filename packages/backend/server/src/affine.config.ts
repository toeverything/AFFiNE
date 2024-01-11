/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Custom configurations

const env = process.env;
const node = AFFiNE.node;

// TODO: may be separate config overring in `affine.[env].config`?
if (node.prod) {
  // Storage
  if (env.R2_OBJECT_STORAGE_ACCOUNT_ID) {
    AFFiNE.storage.providers.r2 = {
      accountId: env.R2_OBJECT_STORAGE_ACCOUNT_ID,
      credentials: {
        accessKeyId: env.R2_OBJECT_STORAGE_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_OBJECT_STORAGE_SECRET_ACCESS_KEY!,
      },
    };
    AFFiNE.storage.storages.avatar.provider = 'r2';
    AFFiNE.storage.storages.avatar.bucket = 'account-avatar';
    AFFiNE.storage.storages.avatar.publicLinkFactory = key =>
      `https://avatar.affineassets.com/${key}`;

    AFFiNE.storage.storages.blob.provider = 'r2';
    AFFiNE.storage.storages.blob.bucket = `workspace-blobs-${
      AFFiNE.affine.canary ? 'canary' : 'prod'
    }`;
  }

  // Metrics
  AFFiNE.metrics.enabled = true;
}
