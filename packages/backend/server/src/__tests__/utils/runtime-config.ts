import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function createTestRuntimeConfig(databaseUrl: string) {
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
      db: { datasourceUrl: databaseUrl },
      storages: {
        'avatar.storage': storage('avatars'),
        'blob.storage': storage('blobs'),
      },
      copilot: {
        enabled: true,
        storage: storage('copilot'),
      },
    })
  );
  return {
    configPath,
    storagePath,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
