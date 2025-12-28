import { createHash } from 'node:crypto';
import { mock } from 'node:test';

import {
  Config,
  ConfigFactory,
  PROXY_MULTIPART_PATH,
  PROXY_UPLOAD_PATH,
  StorageProviderConfig,
  StorageProviderFactory,
  toBuffer,
} from '../../../base';
import {
  R2StorageConfig,
  R2StorageProvider,
} from '../../../base/storage/providers/r2';
import { SIGNED_URL_EXPIRED } from '../../../base/storage/providers/utils';
import { WorkspaceBlobStorage } from '../../../core/storage';
import { MULTIPART_THRESHOLD } from '../../../core/storage/constants';
import { R2UploadController } from '../../../core/storage/r2-proxy';
import { app, e2e, Mockers } from '../test';

class MockR2Provider extends R2StorageProvider {
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

  constructor(config: R2StorageConfig, bucket: string) {
    super(config, bucket);
  }

  destroy() {
    this.client.destroy();
  }

  // @ts-ignore expect override
  override async proxyPutObject(
    key: string,
    body: any,
    options: { contentType?: string; contentLength?: number } = {}
  ) {
    this.putCalls.push({
      key,
      body: await toBuffer(body),
      contentType: options.contentType,
      contentLength: options.contentLength,
    });
  }

  override async proxyUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: any,
    options: { contentLength?: number } = {}
  ) {
    const etag = `"etag-${partNumber}"`;
    this.partCalls.push({
      key,
      uploadId,
      partNumber,
      etag,
      body: await toBuffer(body),
      contentLength: options.contentLength,
    });
    return etag;
  }

  override async createMultipartUpload() {
    this.createMultipartCalls += 1;
    return {
      uploadId: 'upload-id',
      expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRED * 1000),
    };
  }

  override async listMultipartUploadParts(key: string, uploadId: string) {
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
let provider: MockR2Provider | null = null;
let factoryCreateUnmocked: StorageProviderFactory['create'];

e2e.before(() => {
  defaultBlobStorage = structuredClone(app.get(Config).storages.blob.storage);
  const factory = app.get(StorageProviderFactory);
  factoryCreateUnmocked = factory.create.bind(factory);
});

e2e.beforeEach(async () => {
  provider?.destroy();
  provider = null;

  const factory = app.get(StorageProviderFactory);
  mock.method(factory, 'create', (config: StorageProviderConfig) => {
    if (config.provider === 'cloudflare-r2') {
      if (!provider) {
        provider = new MockR2Provider(
          config.config as R2StorageConfig,
          config.bucket
        );
      }
      return provider;
    }
    return factoryCreateUnmocked(config);
  });

  await useR2Storage();
});

e2e.afterEach.always(async () => {
  await setBlobStorage(defaultBlobStorage);
  provider?.destroy();
  provider = null;
  mock.reset();
});

async function setBlobStorage(storage: StorageProviderConfig) {
  provider?.destroy();
  provider = null;
  const configFactory = app.get(ConfigFactory);
  configFactory.override({ storages: { blob: { storage } } });
  const blobStorage = app.get(WorkspaceBlobStorage);
  await blobStorage.onConfigInit();
  const controller = app.get(R2UploadController);
  // reset cached provider in controller
  (controller as any).provider = null;
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

function getProvider(): MockR2Provider {
  if (!provider) {
    throw new Error('R2 provider is not initialized');
  }
  return provider;
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
      mutation getBlobUploadPartUrl($workspaceId: String!, $key: String!, $uploadId: String!, $partNumber: Int!) {
        getBlobUploadPartUrl(workspaceId: $workspaceId, key: $key, uploadId: $uploadId, partNumber: $partNumber) {
          uploadUrl
          headers
          expiresAt
        }
      }
    `,
    { workspaceId, key, uploadId, partNumber },
    'getBlobUploadPartUrl'
  );

  return data.getBlobUploadPartUrl;
}

async function setupWorkspace() {
  const owner = await app.signup({ feature: 'pro_plan_v1' });
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

e2e('should proxy single upload with valid signature', async t => {
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
  t.is(uploadUrl.pathname, PROXY_UPLOAD_PATH);

  const res = await app
    .PUT(uploadUrl.pathname + uploadUrl.search)
    .set('content-type', 'text/plain')
    .set('content-length', buffer.length.toString())
    .send(buffer);

  t.is(res.status, 200);
  const calls = getProvider().putCalls;
  t.is(calls.length, 1);
  t.is(calls[0].key, `${workspace.id}/${key}`);
  t.is(calls[0].contentType, 'text/plain');
  t.is(calls[0].contentLength, buffer.length);
  t.deepEqual(calls[0].body, buffer);
});

e2e('should proxy multipart upload and return etag', async t => {
  const { workspace } = await setupWorkspace();
  const key = 'multipart-object';
  const totalSize = MULTIPART_THRESHOLD + 1024;
  const init = await createBlobUpload(workspace.id, key, totalSize, 'bin');

  t.is(init.method, 'MULTIPART');
  t.is(init.uploadId, 'upload-id');
  t.deepEqual(init.uploadedParts, []);

  const part = await getBlobUploadPartUrl(workspace.id, key, init.uploadId, 1);
  const partUrl = new URL(part.uploadUrl, app.url);
  t.is(partUrl.pathname, PROXY_MULTIPART_PATH);

  const payload = Buffer.from('part-body');
  const res = await app
    .PUT(partUrl.pathname + partUrl.search)
    .set('content-length', payload.length.toString())
    .send(payload);

  t.is(res.status, 200);
  t.is(res.get('etag'), '"etag-1"');

  const calls = getProvider().partCalls;
  t.is(calls.length, 1);
  t.is(calls[0].key, `${workspace.id}/${key}`);
  t.is(calls[0].uploadId, 'upload-id');
  t.is(calls[0].partNumber, 1);
  t.is(calls[0].contentLength, payload.length);
  t.deepEqual(calls[0].body, payload);
});

e2e('should resume multipart upload and return uploaded parts', async t => {
  const { workspace } = await setupWorkspace();
  const key = 'multipart-resume';
  const totalSize = MULTIPART_THRESHOLD + 1024;

  const init1 = await createBlobUpload(workspace.id, key, totalSize, 'bin');
  t.is(init1.method, 'MULTIPART');
  t.is(init1.uploadId, 'upload-id');
  t.deepEqual(init1.uploadedParts, []);
  t.is(getProvider().createMultipartCalls, 1);

  const part = await getBlobUploadPartUrl(workspace.id, key, init1.uploadId, 1);
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
  t.deepEqual(init2.uploadedParts, [{ partNumber: 1, etag: '"etag-1"' }]);
  t.is(getProvider().createMultipartCalls, 1);
});

e2e('should reject upload when token is invalid', async t => {
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
  t.is(getProvider().putCalls.length, 0);
});

e2e('should reject upload when url is expired', async t => {
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
  t.is(getProvider().putCalls.length, 0);
});

e2e(
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

e2e(
  'should still fallback to graphql when provider does not support presign',
  async t => {
    await setBlobStorage(defaultBlobStorage);
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

function sha256Base64urlWithPadding(buffer: Buffer) {
  return createHash('sha256')
    .update(buffer)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
