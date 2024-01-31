import { createRequire } from 'node:module';

export const StorageProvide = Symbol('Storage');

let storageModule: typeof import('@affine/storage');
try {
  storageModule = await import('@affine/storage');
} catch {
  const require = createRequire(import.meta.url);
  storageModule =
    process.arch === 'arm64'
      ? require('../../../storage.arm64.node')
      : process.arch === 'arm'
        ? require('../../../storage.armv7.node')
        : require('../../../storage.node');
}

export const mergeUpdatesInApplyWay = storageModule.mergeUpdatesInApplyWay;

export const verifyChallengeResponse = async (
  response: any,
  bits: number,
  resource: string
) => {
  if (typeof response !== 'string' || !response || !resource) return false;
  return storageModule.verifyChallengeResponse(response, bits, resource);
};

export const mintChallengeResponse = async (resource: string, bits: number) => {
  if (!resource) return null;
  return storageModule.mintChallengeResponse(resource, bits);
};

export type {
  BlobInputType,
  BlobOutputType,
  GetObjectMetadata,
  ListObjectsMetadata,
  PutObjectMetadata,
  StorageProvider,
} from './providers';
export { createStorageProvider } from './providers';
export { toBuffer } from './providers/utils';
