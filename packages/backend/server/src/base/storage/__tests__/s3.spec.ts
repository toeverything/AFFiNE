import test from 'ava';

import { S3StorageProvider } from '../providers/s3';
import { SIGNED_URL_EXPIRED } from '../providers/utils';

const config = {
  region: 'auto',
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
  let receivedCommand: any;
  const sendStub = async (command: any) => {
    receivedCommand = command;
    return { UploadId: 'upload-1' };
  };
  (provider as any).client = { send: sendStub };

  const now = Date.now();
  const result = await provider.createMultipartUpload('key', {
    contentType: 'text/plain',
  });

  t.is(result?.uploadId, 'upload-1');
  t.true(result!.expiresAt.getTime() >= now + SIGNED_URL_EXPIRED * 1000 - 2000);
  t.true(result!.expiresAt.getTime() <= now + SIGNED_URL_EXPIRED * 1000 + 2000);
  t.is(receivedCommand.input.Key, 'key');
  t.is(receivedCommand.input.ContentType, 'text/plain');
});

test('completeMultipartUpload should order parts', async t => {
  const provider = createProvider();
  let called = false;
  const sendStub = async (command: any) => {
    called = true;
    t.deepEqual(command.input.MultipartUpload.Parts, [
      { ETag: 'a', PartNumber: 1 },
      { ETag: 'b', PartNumber: 2 },
    ]);
  };
  (provider as any).client = { send: sendStub };

  await provider.completeMultipartUpload('key', 'upload-1', [
    { partNumber: 2, etag: 'b' },
    { partNumber: 1, etag: 'a' },
  ]);
  t.true(called);
});
