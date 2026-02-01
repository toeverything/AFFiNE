import test from 'ava';

import { S3StorageProvider } from '../providers/s3';
import { SIGNED_URL_EXPIRED } from '../providers/utils';

const config = {
  region: 'us-east-1',
  endpoint: 'https://s3.us-east-1.amazonaws.com',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
};

function createProvider() {
  return new S3StorageProvider(config, 'test-bucket');
}

test('presignPut should return url and headers', async t => {
  const provider = createProvider();
  const result = await provider.presignPut('key', {
    contentType: 'text/plain',
  });

  t.truthy(result);
  t.true(result!.url.length > 0);
  t.true(result!.url.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'));
  t.true(result!.url.includes('X-Amz-SignedHeaders='));
  t.true(result!.url.includes('content-type'));
  t.deepEqual(result!.headers, { 'Content-Type': 'text/plain' });
  const now = Date.now();
  t.true(result!.expiresAt.getTime() >= now + SIGNED_URL_EXPIRED * 1000 - 2000);
  t.true(result!.expiresAt.getTime() <= now + SIGNED_URL_EXPIRED * 1000 + 2000);
});

test('presignUploadPart should return url', async t => {
  const provider = createProvider();
  const result = await provider.presignUploadPart('key', 'upload-1', 3);

  t.truthy(result);
  t.true(result!.url.length > 0);
  t.true(result!.url.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'));
});

test('createMultipartUpload should return uploadId', async t => {
  const provider = createProvider();
  let receivedKey: string | undefined;
  let receivedMeta: any;
  (provider as any).client = {
    createMultipartUpload: async (key: string, meta: any) => {
      receivedKey = key;
      receivedMeta = meta;
      return { uploadId: 'upload-1' };
    },
  };

  const now = Date.now();
  const result = await provider.createMultipartUpload('key', {
    contentType: 'text/plain',
  });

  t.is(result?.uploadId, 'upload-1');
  t.true(result!.expiresAt.getTime() >= now + SIGNED_URL_EXPIRED * 1000 - 2000);
  t.true(result!.expiresAt.getTime() <= now + SIGNED_URL_EXPIRED * 1000 + 2000);
  t.is(receivedKey, 'key');
  t.is(receivedMeta.contentType, 'text/plain');
});

test('completeMultipartUpload should order parts', async t => {
  const provider = createProvider();
  let receivedParts: any;
  (provider as any).client = {
    completeMultipartUpload: async (
      _key: string,
      _uploadId: string,
      parts: any
    ) => {
      receivedParts = parts;
    },
  };

  await provider.completeMultipartUpload('key', 'upload-1', [
    { partNumber: 2, etag: 'b' },
    { partNumber: 1, etag: 'a' },
  ]);
  t.deepEqual(receivedParts, [
    { partNumber: 1, etag: 'a' },
    { partNumber: 2, etag: 'b' },
  ]);
});
