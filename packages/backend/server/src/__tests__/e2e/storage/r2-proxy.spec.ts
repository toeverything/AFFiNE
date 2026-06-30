import { createHash, createHmac } from 'node:crypto';
import { mock } from 'node:test';

import {
  Config,
  ConfigFactory,
  PROXY_MULTIPART_PATH,
  PROXY_UPLOAD_PATH,
  type R2StorageConfig,
  SIGNED_URL_EXPIRED,
  type StorageProviderConfig,
} from '../../../base';
import { EntitlementService } from '../../../core/entitlement';
import { MULTIPART_THRESHOLD } from '../../../core/storage/constants';
import { StorageRuntimeProvider } from '../../../core/storage-runtime';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '../../../plugins/payment/types';
import { app, e2e, Mockers } from '../test';

class MockStorageRuntime {
  createMultipartCalls = 0;
  putCalls: {
    key: string;
    body: Buffer;
    contentType?: string;
    contentLength?: number;
  }[] = [];
  partCalls: {
    key: string;
    uploadId: string;
    partNumber: number;
    etag: string;
    body: Buffer;
    contentLength?: number;
  }[] = [];

  async providerCapabilities() {
    const storage = app.get(Config).storages.blob.storage;
    const usePresignedURL = (storage.config as R2StorageConfig).usePresignedURL;
    if (storage.provider !== 'cloudflare-r2') {
      return {
        put: true,
        get: true,
        head: true,
        list: true,
        delete: true,
        presignPut: false,
        presignGet: false,
        multipartDirect: false,
        proxyUpload: false,
        assetpack: false,
        serverMediatedOnly: true,
      };
    }
    return {
      put: true,
      get: true,
      head: true,
      list: true,
      delete: true,
      presignPut: true,
      presignGet: false,
      multipartDirect: true,
      proxyUpload: !!usePresignedURL?.enabled,
      assetpack: false,
      serverMediatedOnly: false,
    };
  }

  async presignPut(
    _scope: string,
    key: string,
    metadata: { contentType?: string; contentLength?: number } = {}
  ) {
    const storage = app.get(Config).storages.blob.storage;
    const r2 = storage.config as R2StorageConfig;
    if (!r2.usePresignedURL?.enabled) {
      return {
        url: 'https://test-bucket.r2.example.com/object?X-Amz-Algorithm=AWS4-HMAC-SHA256',
        headers: {},
        expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRED * 1000),
      };
    }
    const [workspaceId, blobKey] = key.split('/');
    return createProxyUrl(
      PROXY_UPLOAD_PATH,
      [
        workspaceId,
        blobKey,
        metadata.contentType ?? 'application/octet-stream',
        metadata.contentLength,
      ],
      {
        workspaceId,
        key: blobKey,
        contentType: metadata.contentType ?? 'application/octet-stream',
        contentLength: metadata.contentLength,
      }
    );
  }

  async createMultipartUpload() {
    this.createMultipartCalls += 1;
    return {
      uploadId: 'upload-id',
      expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRED * 1000),
    };
  }

  async presignUploadPart(
    _scope: string,
    key: string,
    uploadId: string,
    partNumber: number
  ) {
    const [workspaceId, blobKey] = key.split('/');
    return createProxyUrl(
      PROXY_MULTIPART_PATH,
      [workspaceId, blobKey, uploadId, partNumber],
      {
        workspaceId,
        key: blobKey,
        uploadId,
        partNumber,
      }
    );
  }

  async listMultipartUploadParts(
    _scope: string,
    key: string,
    uploadId: string
  ) {
    const latest = new Map<number, string>();
    for (const part of this.partCalls) {
      if (part.key !== key || part.uploadId !== uploadId) {
        continue;
      }
      latest.set(part.partNumber, part.etag);
    }
    return [...latest.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([partNumber, etag]) => ({ partNumber, etag }));
  }

  async putObject(
    _scope: string,
    key: string,
    body: Buffer,
    options: { contentType?: string; contentLength?: number } = {}
  ) {
    this.putCalls.push({
      key,
      body,
      contentType: options.contentType,
      contentLength: options.contentLength,
    });
    return {
      contentType: options.contentType ?? 'application/octet-stream',
      contentLength: options.contentLength ?? body.length,
      lastModified: new Date(),
    };
  }

  async proxyUploadPart(
    _scope: string,
    key: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
    contentLength?: number
  ) {
    const etag = `etag-${partNumber}`;
    this.partCalls.push({
      key,
      uploadId,
      partNumber,
      etag,
      body,
      contentLength,
    });
    return etag;
  }
}

const baseR2Storage: StorageProviderConfig = {
  provider: 'cloudflare-r2',
  bucket: 'test-bucket',
  config: {
    accountId: 'test-account',
    region: 'auto',
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
    usePresignedURL: {
      enabled: true,
      urlPrefix: 'https://cdn.example.com',
      signKey: 'r2-sign-key',
    },
  },
};

let defaultBlobStorage: StorageProviderConfig;
let runtime: MockStorageRuntime;

e2e.before(() => {
  defaultBlobStorage = structuredClone(app.get(Config).storages.blob.storage);
});

e2e.beforeEach(async () => {
  runtime = new MockStorageRuntime();
  const rt = app.get(StorageRuntimeProvider);
  for (const method of [
    'providerCapabilities',
    'presignPut',
    'createMultipartUpload',
    'presignUploadPart',
    'listMultipartUploadParts',
    'putObject',
    'proxyUploadPart',
  ] as const) {
    mock.method(rt, method, (...args: any[]) =>
      (runtime[method] as any)(...args)
    );
  }

  await useR2Storage();
});

e2e.afterEach.always(async () => {
  await setBlobStorage(defaultBlobStorage);
  mock.reset();
});

async function setBlobStorage(storage: StorageProviderConfig) {
  const configFactory = app.get(ConfigFactory);
  configFactory.override({ storages: { blob: { storage } } });
}

async function useR2Storage(
  overrides?: Partial<R2StorageConfig['usePresignedURL']>
) {
  const storage = structuredClone(baseR2Storage) as StorageProviderConfig;
  const usePresignedURL = {
    ...(structuredClone(
      ((baseR2Storage as StorageProviderConfig).config as R2StorageConfig)
        .usePresignedURL ?? {}
    ) as R2StorageConfig['usePresignedURL']),
    ...overrides,
  };
  (storage.config as R2StorageConfig).usePresignedURL =
    usePresignedURL as R2StorageConfig['usePresignedURL'];
  await setBlobStorage(storage);
  return storage;
}

function getRuntime(): MockStorageRuntime {
  return runtime;
}

async function createBlobUpload(
  workspaceId: string,
  key: string,
  size: number,
  mime: string
) {
  const data = await gql(
    `
      mutation createBlobUpload($workspaceId: String!, $key: String!, $size: Int!, $mime: String!) {
        createBlobUpload(workspaceId: $workspaceId, key: $key, size: $size, mime: $mime) {
          method
          blobKey
          alreadyUploaded
          uploadUrl
          uploadId
          partSize
          uploadedParts {
            partNumber
            etag
          }
        }
      }
    `,
    { workspaceId, key, size, mime },
    'createBlobUpload'
  );

  return data.createBlobUpload;
}

async function getBlobUploadPartUrl(
  workspaceId: string,
  key: string,
  uploadId: string,
  partNumber: number
) {
  const data = await gql(
    `
      query getBlobUploadPartUrl($workspaceId: String!, $key: String!, $uploadId: String!, $partNumber: Int!) {
        workspace(id: $workspaceId) {
          blobUploadPartUrl(key: $key, uploadId: $uploadId, partNumber: $partNumber) {
            uploadUrl
            headers
            expiresAt
          }
        }
      }
    `,
    { workspaceId, key, uploadId, partNumber },
    'getBlobUploadPartUrl'
  );

  return data.workspace.blobUploadPartUrl;
}

async function setupWorkspace() {
  const owner = await app.signup();
  await app.get(EntitlementService).upsertFromCloudSubscription({
    targetId: owner.id,
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Monthly,
    status: SubscriptionStatus.Active,
  });
  const workspace = await app.create(Mockers.Workspace, { owner });
  return { owner, workspace };
}

async function gql<QueryData = any>(
  query: string,
  variables: Record<string, any>,
  operationName: string
): Promise<QueryData> {
  const res = await app
    .POST('/graphql')
    .set({ 'x-request-id': 'test', 'x-operation-name': operationName })
    .send({ query, variables })
    .expect(200);

  if (res.body.errors?.length) {
    throw new Error(res.body.errors[0].message);
  }

  return res.body.data;
}

e2e.serial('should proxy single upload with valid signature', async t => {
  const { workspace } = await setupWorkspace();
  const buffer = Buffer.from('r2-proxy');
  const key = sha256Base64urlWithPadding(buffer);

  const init = await createBlobUpload(
    workspace.id,
    key,
    buffer.length,
    'text/plain'
  );

  t.is(init.method, 'PRESIGNED');
  t.truthy(init.uploadUrl);
  const uploadUrl = new URL(init.uploadUrl, app.url);
  t.is(uploadUrl.origin, 'https://cdn.example.com');
  t.is(uploadUrl.pathname, PROXY_UPLOAD_PATH);

  const res = await app
    .PUT(uploadUrl.pathname + uploadUrl.search)
    .set('content-type', 'text/plain')
    .set('content-length', buffer.length.toString())
    .send(buffer);

  t.is(res.status, 200);
  const calls = getRuntime().putCalls;
  t.is(calls.length, 1);
  t.is(calls[0].key, `${workspace.id}/${key}`);
  t.is(calls[0].contentType, 'text/plain');
  t.is(calls[0].contentLength, buffer.length);
  t.deepEqual(calls[0].body, buffer);
});

e2e.serial('should proxy multipart upload and return etag', async t => {
  const { workspace } = await setupWorkspace();
  const key = 'multipart-object';
  const totalSize = MULTIPART_THRESHOLD + 1024;
  const init = await createBlobUpload(workspace.id, key, totalSize, 'bin');

  t.is(init.method, 'MULTIPART');
  t.is(init.uploadId, 'upload-id');
  t.deepEqual(init.uploadedParts, []);

  const part = await getBlobUploadPartUrl(workspace.id, key, init.uploadId, 1);
  const partUrl = new URL(part.uploadUrl, app.url);
  t.is(partUrl.origin, 'https://cdn.example.com');
  t.is(partUrl.pathname, PROXY_MULTIPART_PATH);

  const payload = Buffer.from('part-body');
  const res = await app
    .PUT(partUrl.pathname + partUrl.search)
    .set('content-length', payload.length.toString())
    .send(payload);

  t.is(res.status, 200);
  t.is(res.get('etag'), 'etag-1');

  const calls = getRuntime().partCalls;
  t.is(calls.length, 1);
  t.is(calls[0].key, `${workspace.id}/${key}`);
  t.is(calls[0].uploadId, 'upload-id');
  t.is(calls[0].partNumber, 1);
  t.is(calls[0].contentLength, payload.length);
  t.deepEqual(calls[0].body, payload);
});

e2e.serial(
  'should resume multipart upload and return uploaded parts',
  async t => {
    const { workspace } = await setupWorkspace();
    const key = 'multipart-resume';
    const totalSize = MULTIPART_THRESHOLD + 1024;

    const init1 = await createBlobUpload(workspace.id, key, totalSize, 'bin');
    t.is(init1.method, 'MULTIPART');
    t.is(init1.uploadId, 'upload-id');
    t.deepEqual(init1.uploadedParts, []);
    t.is(getRuntime().createMultipartCalls, 1);

    const part = await getBlobUploadPartUrl(
      workspace.id,
      key,
      init1.uploadId,
      1
    );
    const payload = Buffer.from('part-body');
    const partUrl = new URL(part.uploadUrl, app.url);
    await app
      .PUT(partUrl.pathname + partUrl.search)
      .set('content-length', payload.length.toString())
      .send(payload)
      .expect(200);

    const init2 = await createBlobUpload(workspace.id, key, totalSize, 'bin');
    t.is(init2.method, 'MULTIPART');
    t.is(init2.uploadId, 'upload-id');
    t.deepEqual(init2.uploadedParts, [{ partNumber: 1, etag: 'etag-1' }]);
    t.is(getRuntime().createMultipartCalls, 1);
  }
);

e2e.serial('should reject upload when token is invalid', async t => {
  const { workspace } = await setupWorkspace();
  const buffer = Buffer.from('payload');
  const init = await createBlobUpload(
    workspace.id,
    sha256Base64urlWithPadding(buffer),
    buffer.length,
    'text/plain'
  );
  const uploadUrl = new URL(init.uploadUrl, app.url);
  uploadUrl.searchParams.set('token', 'invalid-token');

  const res = await app
    .PUT(uploadUrl.pathname + uploadUrl.search)
    .set('content-type', 'text/plain')
    .set('content-length', buffer.length.toString())
    .send(buffer);

  t.is(res.status, 400);
  t.is(res.body.message, 'Invalid upload token');
  t.is(getRuntime().putCalls.length, 0);
});

e2e.serial('should reject upload when url is expired', async t => {
  const { workspace } = await setupWorkspace();
  const buffer = Buffer.from('expired');
  const init = await createBlobUpload(
    workspace.id,
    sha256Base64urlWithPadding(buffer),
    buffer.length,
    'text/plain'
  );
  const uploadUrl = new URL(init.uploadUrl, app.url);
  uploadUrl.searchParams.set(
    'exp',
    (Math.floor(Date.now() / 1000) - 1).toString()
  );

  const res = await app
    .PUT(uploadUrl.pathname + uploadUrl.search)
    .set('content-type', 'text/plain')
    .set('content-length', buffer.length.toString())
    .send(buffer);

  t.is(res.status, 400);
  t.is(res.body.message, 'Upload URL expired');
  t.is(getRuntime().putCalls.length, 0);
});

e2e.serial(
  'should fall back to direct presign when custom domain is disabled',
  async t => {
    await useR2Storage({
      enabled: false,
      urlPrefix: undefined,
      signKey: undefined,
    });
    const { workspace } = await setupWorkspace();
    const buffer = Buffer.from('plain');

    const init = await createBlobUpload(
      workspace.id,
      sha256Base64urlWithPadding(buffer),
      buffer.length,
      'text/plain'
    );

    t.is(init.method, 'PRESIGNED');
    t.truthy(init.uploadUrl.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'));
    t.not(new URL(init.uploadUrl, app.url).pathname, PROXY_UPLOAD_PATH);
  }
);

e2e.serial(
  'should still fallback to graphql when provider does not support presign',
  async t => {
    await setBlobStorage({
      provider: 'fs',
      bucket: 'test-fallback-bucket',
      config: {
        path: '/tmp/affine-r2-proxy-test',
      },
    });
    const { workspace } = await setupWorkspace();
    const buffer = Buffer.from('graph');

    const init = await createBlobUpload(
      workspace.id,
      sha256Base64urlWithPadding(buffer),
      buffer.length,
      'text/plain'
    );

    t.is(init.method, 'GRAPHQL');
  }
);

function createProxyUrl(
  path: string,
  canonicalFields: (string | number | undefined)[],
  query: Record<string, string | number | undefined>
) {
  const signKey = (
    app.get(Config).storages.blob.storage.config as R2StorageConfig
  ).usePresignedURL?.signKey;
  if (!signKey) {
    throw new Error('missing R2 proxy sign key');
  }
  const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_EXPIRED;
  const canonical = [
    path,
    ...canonicalFields.map(field =>
      field === undefined ? '' : field.toString()
    ),
    exp.toString(),
  ].join('\n');
  const token = createHmac('sha256', signKey)
    .update(canonical)
    .digest('base64');

  const url = new URL(`http://localhost${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value.toString());
    }
  }
  url.searchParams.set('exp', exp.toString());
  url.searchParams.set('token', `${exp}-${token}`);
  return { url: url.pathname + url.search, expiresAt: new Date(exp * 1000) };
}

function sha256Base64urlWithPadding(buffer: Buffer) {
  return createHash('sha256')
    .update(buffer)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
