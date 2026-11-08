import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { set } from 'lodash-es';

import { getDefaultConfig, override } from '../../base/config/register';

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
      deployment: { type: globalThis.env.selfhosted ? 'selfhosted' : 'cloud' },
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
    }),
    { mode: 0o600 }
  );
  return {
    configPath,
    storagePath,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

export function applyTestConfigOverrides(
  configPath: string,
  overrides: DeepPartial<AppConfig> = {}
) {
  const config = getDefaultConfig();
  const fixture = JSON.parse(readFileSync(configPath, 'utf-8'));
  for (const [module, values] of Object.entries(fixture)) {
    if (module === 'deployment') continue;
    for (const [key, value] of Object.entries(
      values as Record<string, unknown>
    )) {
      set(config, `${module}.${key}`, value);
    }
  }
  override(config, overrides);
  writeFileSync(
    configPath,
    JSON.stringify({
      ...config,
      deployment: fixture.deployment,
      storages: {
        'avatar.storage': config.storages.avatar.storage,
        'blob.storage': config.storages.blob.storage,
      },
    })
  );
}
