import type { AppConfig } from '../../config/env.js';
import type { MosaicStore } from '../../domain/ports.js';
import { MemoryStore } from './memory-store.js';
import { PostgresStore } from './postgres-store.js';

export async function createStore(config: AppConfig): Promise<MosaicStore> {
  const mode = config.MOSAIC_PERSISTENCE;
  const production = config.NODE_ENV === 'production';

  // `memory` is only a valid explicit choice (e.g. ephemeral demo/preview
  // deployments); never something we silently fall into in production.
  if (mode === 'memory') {
    return new MemoryStore();
  }

  if (!config.DATABASE_URL) {
    if (production) {
      throw new Error(
        'DATABASE_URL is required when NODE_ENV=production. Set MOSAIC_PERSISTENCE=memory ' +
          'explicitly if ephemeral in-memory storage (data lost on restart) is intended.'
      );
    }
    return new MemoryStore();
  }

  try {
    return await PostgresStore.connect(config.DATABASE_URL);
  } catch (error) {
    if (production) {
      // Never silently downgrade to in-memory storage in production: that
      // would mask a real outage as if the server were healthy.
      throw error;
    }
    return new MemoryStore();
  }
}
