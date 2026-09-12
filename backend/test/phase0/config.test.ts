import { describe, expect, it } from 'vitest';

import { hasFeature, loadConfig } from '../../src/config/env.js';

describe('config', () => {
  it('loads 12-factor defaults', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
    });
    expect(config.PORT).toBe(3010);
    expect(config.HOST).toBe('0.0.0.0');
    expect(config.MOSAIC_COMPAT_VERSION).toBe('0.27.5');
    expect(config.flavor).toBe('allinone');
    expect(config.deploymentType).toBe('selfhosted');
    expect(config.MOSAIC_FEATURES).toEqual([]);
    expect(config.MOSAIC_SERVER).toBeUndefined();
    expect(config.MOSAIC_STATIC_DIR).toBeUndefined();
    expect(config.SYNC_COMPACT_UPDATES).toBe(64);
    expect(config.SYNC_MAX_UPDATE_BYTES).toBe(1_048_576);
    expect(config.BLOB_MAX_BYTES).toBe(100 * 1024 * 1024);
    expect(config.DOC_HISTORY_LIMIT).toBe(50);
  });

  it('parses MOSAIC_FEATURES as a CSV flag list', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      MOSAIC_FEATURES: 'sync,blobs',
    });
    expect(hasFeature(config, 'sync')).toBe(true);
    expect(hasFeature(config, 'blobs')).toBe(true);
    expect(hasFeature(config, 'ai')).toBe(false);
  });

  it('treats MOSAIC_SERVER=1 as the cutover flag on GET /info features', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      MOSAIC_SERVER: '1',
    });
    expect(config.MOSAIC_SERVER).toBe(true);
    expect(hasFeature(config, 'mosaic')).toBe(true);
    expect(config.MOSAIC_FEATURES[0]).toBe('mosaic');
  });

  it('rejects an invalid PORT', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'test',
        PORT: 'not-a-port',
      })
    ).toThrow();
  });
});
