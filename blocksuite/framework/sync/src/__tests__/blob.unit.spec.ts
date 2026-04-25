import { NoopLogger } from '@blocksuite/global/utils';
import { beforeEach, describe, expect, it } from 'vitest';

import { BlobEngine } from '../blob/engine.js';
import { MemoryBlobSource } from '../blob/impl/index.js';

describe('BlobEngine with MemoryBlobSource', () => {
  let mainSource: MemoryBlobSource;
  let shadowSource: MemoryBlobSource;
  let engine: BlobEngine;

  beforeEach(() => {
    mainSource = new MemoryBlobSource();
    shadowSource = new MemoryBlobSource();
    engine = new BlobEngine(mainSource, [shadowSource], new NoopLogger());
  });

  it('should set and get blobs', async () => {
    const blob = new Blob(['test'], { type: 'text/plain' });
    const key = await engine.set(blob);
    const retrievedBlob = await engine.get(key);
    expect(retrievedBlob).not.toBeNull();
    expect(await retrievedBlob?.text()).toBe('test');
  });

  it('should sync blobs between main and shadow sources', async () => {
    const blob = new Blob(['test'], { type: 'text/plain' });
    const key = await engine.set(blob);
    await engine.sync();
    const retrievedBlob = await shadowSource.get(key);
    expect(retrievedBlob).not.toBeNull();
    expect(await retrievedBlob?.text()).toBe('test');
  });

  it('should list all blobs', async () => {
    const blob1 = new Blob(['test1'], { type: 'text/plain' });
    const blob2 = new Blob(['test2'], { type: 'text/plain' });
    await engine.set(blob1);
    await engine.set(blob2);
    const blobList = await engine.list();
    expect(blobList.length).toBe(2);
  });

  it('should not delete blobs (unsupported feature)', async () => {
    const blob = new Blob(['test'], { type: 'text/plain' });
    const key = await engine.set(blob);
    await engine.delete(key);
    const retrievedBlob = await engine.get(key);
    expect(retrievedBlob).not.toBeNull();
  });

  it('should return the main source normalized key', async () => {
    const blob = new Blob(['test'], { type: 'text/plain' });
    mainSource.set = async (key, value) => {
      const normalizedKey = `normalized/${key}`;
      mainSource.map.set(normalizedKey, value);
      return normalizedKey;
    };

    const key = await engine.set('custom-key', blob);

    expect(key).toBe('normalized/custom-key');
    expect(await mainSource.get(key)).toBe(blob);
    expect(await shadowSource.get(key)).toBe(blob);
  });
});
