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
  AFFiNE.use('cloudflare-r2', {
    accountId: env.R2_OBJECT_STORAGE_ACCOUNT_ID,
    credentials: {
      accessKeyId: env.R2_OBJECT_STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_OBJECT_STORAGE_SECRET_ACCESS_KEY!,
    },
  });
  AFFiNE.storages.avatar.provider = 'cloudflare-r2';
  AFFiNE.storages.avatar.bucket = 'account-avatar';
  AFFiNE.storages.avatar.publicLinkFactory = key =>
    `https://avatar.affineassets.com/${key}`;

  AFFiNE.storages.blob.provider = 'cloudflare-r2';
  AFFiNE.storages.blob.bucket = `workspace-blobs-${
    AFFiNE.affine.canary ? 'canary' : 'prod'
  }`;

  AFFiNE.use('copilot', {
    storage: {
      provider: 'cloudflare-r2',
      bucket: `workspace-copilot-${AFFiNE.affine.canary ? 'canary' : 'prod'}`,
    },
  });
}

AFFiNE.use('copilot', {
  openai: {
    apiKey: '',
  },
  fal: {
    apiKey: '',
  },
});
AFFiNE.use('redis', {
  host: env.REDIS_SERVER_HOST,
  db: 0,
  port: 6379,
  username: env.REDIS_SERVER_USER,
  password: env.REDIS_SERVER_PASSWORD,
});
AFFiNE.use('payment', {
  stripe: {
    keys: {
      // fake the key to ensure the server generate full GraphQL Schema even env vars are not set
      APIKey: '1',
      webhookKey: '1',
    },
  },
});
AFFiNE.use('oauth');

/* Captcha Plugin Default Config */
AFFiNE.use('captcha', {
  turnstile: {},
  challenge: {
    bits: 20,
  },
});

if (AFFiNE.deploy) {
  AFFiNE.mailer = {
    service: 'gmail',
    auth: {
      user: env.MAILER_USER,
      pass: env.MAILER_PASSWORD,
    },
  };

  AFFiNE.use('gcloud');
}
