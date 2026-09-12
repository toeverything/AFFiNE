import { describe, expect, it } from 'vitest';

import { createStore } from '../../src/adapters/persistence/store.js';
import { MemoryStore } from '../../src/adapters/persistence/memory-store.js';
import { testConfig } from '../helpers/config.js';

describe('createStore', () => {
  it('fails fast in production when persistence is unconfigured, instead of silently using MemoryStore', async () => {
    await expect(
      createStore(
        testConfig({
          NODE_ENV: 'production',
          MOSAIC_PERSISTENCE: undefined,
          DATABASE_URL: undefined,
        })
      )
    ).rejects.toThrow(/DATABASE_URL is required/);
  });

  it('still allows an explicit MOSAIC_PERSISTENCE=memory opt-in in production', async () => {
    const store = await createStore(
      testConfig({
        NODE_ENV: 'production',
        MOSAIC_PERSISTENCE: 'memory',
        DATABASE_URL: undefined,
      })
    );
    expect(store).toBeInstanceOf(MemoryStore);
  });

  it('keeps the dev/test fallback to MemoryStore when DATABASE_URL is unset', async () => {
    const store = await createStore(
      testConfig({
        NODE_ENV: 'test',
        MOSAIC_PERSISTENCE: undefined,
        DATABASE_URL: undefined,
      })
    );
    expect(store).toBeInstanceOf(MemoryStore);
  });

  it('rejects in production when Postgres connection fails, rather than downgrading to MemoryStore', async () => {
    await expect(
      createStore(
        testConfig({
          NODE_ENV: 'production',
          MOSAIC_PERSISTENCE: 'postgres',
          DATABASE_URL: 'postgres://nouser:nopass@127.0.0.1:1/nonexistent',
        })
      )
    ).rejects.toThrow();
  });
});
