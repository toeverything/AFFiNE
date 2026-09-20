import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const testPrivateKey = privateKey
  .export({ format: 'pem', type: 'pkcs8' })
  .toString();

export async function createTestRuntimeConfig(
  databaseUrl: string,
  indexer: AppConfig['indexer']
) {
  const directory = await mkdtemp(join(tmpdir(), 'affine-server-test-'));
  const storagePath = join(directory, 'storage');
  const storage = (bucket: string) => ({
    provider: 'assetpack',
    bucket,
    config: { path: storagePath },
  });
  const configPath = join(directory, 'config.json');
  await writeFile(
    configPath,
    JSON.stringify({
      crypto: { privateKey: testPrivateKey },
      db: { datasourceUrl: databaseUrl },
      storages: {
        'avatar.storage': storage('avatars'),
        'blob.storage': storage('blobs'),
      },
      copilot: {
        enabled: true,
        storage: storage('copilot'),
      },
      indexer: {
        enabled: indexer.enabled,
        provider: indexer.provider,
      },
    })
  );
  return {
    configPath,
    storagePath,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
