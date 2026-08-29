import {
  BookmarkBlockTransformer,
  type BookmarkBlockProps,
  MAX_SHARE_PREVIEW_BLOB_BYTES,
  MAX_SHARE_PREVIEW_CHAPTERS,
  MAX_SHARE_PREVIEW_SEGMENTS,
  parseSharePreviewBlob,
  SharePreviewRecordLoader,
} from '@blocksuite/affine-model';
import { AssetsManager, MemoryBlobCRUD } from '@blocksuite/store';
import { describe, expect, test, vi } from 'vitest';

const validRecord = {
  version: 1 as const,
  sourceUrl: 'https://example.com/watch?v=1',
  title: 'Example',
  description: 'A useful preview',
  image: 'https://example.com/image.png',
  provider: 'example',
  durationSeconds: 61.5,
  transcript: {
    language: 'en',
    segments: [
      {
        text: 'Hello world',
        startSeconds: 1,
        durationSeconds: 2.5,
        speaker: 'Host',
      },
    ],
    chapters: [{ title: 'Opening', startSeconds: 0 }],
    truncated: false,
  },
};

describe('SharePreviewRecord v1', () => {
  test('parses a bounded v1 record without dropping structured fields', async () => {
    await expect(
      parseSharePreviewBlob(
        new Blob([JSON.stringify(validRecord)], { type: 'application/json' })
      )
    ).resolves.toEqual(validRecord);
  });

  test.each([
    { ...validRecord, transcript: { segments: 'not-an-array' } },
    { ...validRecord, transcript: { segments: [{ text: '' }] } },
    {
      ...validRecord,
      transcript: { segments: [{ text: 'hello', startSeconds: -1 }] },
    },
    {
      ...validRecord,
      transcript: { segments: [], chapters: [{ title: '', startSeconds: 0 }] },
    },
  ])('rejects malformed transcript segments and chapters', async record => {
    await expect(
      parseSharePreviewBlob(new Blob([JSON.stringify(record)]))
    ).rejects.toThrow('Invalid share preview record');
  });

  test('rejects unsupported record versions', async () => {
    await expect(
      parseSharePreviewBlob(
        new Blob([JSON.stringify({ ...validRecord, version: 2 })])
      )
    ).rejects.toThrow('Unsupported share preview record version');
  });

  test.each([
    { ...validRecord, unexpected: true },
    {
      ...validRecord,
      transcript: { segments: [{ text: 'hello', unexpected: true }] },
    },
    {
      ...validRecord,
      transcript: {
        segments: Array.from(
          { length: MAX_SHARE_PREVIEW_SEGMENTS + 1 },
          () => ({ text: 'segment' })
        ),
      },
    },
    {
      ...validRecord,
      transcript: {
        segments: [],
        chapters: Array.from(
          { length: MAX_SHARE_PREVIEW_CHAPTERS + 1 },
          (_, index) => ({ title: `Chapter ${index}`, startSeconds: index })
        ),
      },
    },
  ])('rejects unknown fields and over-limit collections', async record => {
    await expect(
      parseSharePreviewBlob(new Blob([JSON.stringify(record)]))
    ).rejects.toThrow('Invalid share preview record');
  });

  test('rejects an oversized Blob before reading its body', async () => {
    const text = vi.fn();
    const oversized = {
      size: MAX_SHARE_PREVIEW_BLOB_BYTES + 1,
      text,
    } as unknown as Blob;

    await expect(parseSharePreviewBlob(oversized)).rejects.toThrow(
      'Share preview Blob exceeds the size limit'
    );
    expect(text).not.toHaveBeenCalled();
  });

  test('does not read the Blob until details are requested and caches the result', async () => {
    const get = vi
      .fn()
      .mockResolvedValue(
        new Blob([JSON.stringify(validRecord)], { type: 'application/json' })
      );
    const loader = new SharePreviewRecordLoader('details-blob', 1, get);

    expect(get).not.toHaveBeenCalled();
    await expect(loader.load()).resolves.toEqual({
      status: 'loaded',
      record: validRecord,
    });
    await loader.load();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('details-blob');
  });

  test('contains missing and invalid Blob states without throwing into the bookmark view', async () => {
    const missing = new SharePreviewRecordLoader(
      'missing-blob',
      1,
      vi.fn().mockResolvedValue(null)
    );
    const invalid = new SharePreviewRecordLoader(
      'invalid-blob',
      1,
      vi.fn().mockResolvedValue(new Blob(['{"version":1}']))
    );

    await expect(missing.load()).resolves.toEqual({ status: 'unavailable' });
    await expect(invalid.load()).resolves.toEqual({ status: 'unavailable' });
  });

  test('ordinary bookmarks have no details loader work', async () => {
    const get = vi.fn();
    const loader = new SharePreviewRecordLoader(undefined, undefined, get);

    await expect(loader.load()).resolves.toEqual({ status: 'unavailable' });
    expect(get).not.toHaveBeenCalled();
  });

  test.each([
    ['details-blob', undefined],
    ['details-blob', 2],
    [undefined, 1],
  ])(
    'does not read details for a missing or unsupported source/version pair',
    async (sourceId, version) => {
      const get = vi.fn();
      const loader = new SharePreviewRecordLoader(sourceId, version, get);

      await expect(loader.load()).resolves.toEqual({ status: 'unavailable' });
      expect(get).not.toHaveBeenCalled();
    }
  );
});

describe('BookmarkBlockTransformer structured details', () => {
  test('round-trips source/version props and the JSON Blob through snapshot assets', async () => {
    const sourceBlobs = new MemoryBlobCRUD();
    const sourceBlob = new Blob([JSON.stringify(validRecord)], {
      type: 'application/json',
    });
    const sourceId = await sourceBlobs.set(sourceBlob);
    const exportAssets = new AssetsManager({ blob: sourceBlobs });
    await exportAssets.readFromBlob(sourceId);
    const transformer = new BookmarkBlockTransformer(new Map());
    const model = {
      id: 'bookmark',
      flavour: 'affine:bookmark',
      version: 1,
      role: 'content',
      keys: ['url', 'sharePreviewSourceId', 'sharePreviewVersion'],
      props: {
        url: validRecord.sourceUrl,
        sharePreviewSourceId: sourceId,
        sharePreviewVersion: 1,
      },
      children: [],
    } as never;

    const snapshot = transformer.toSnapshot({ model, assets: exportAssets });
    expect(exportAssets.getPathBlobIdMap().get('bookmark')).toBe(sourceId);

    const importedBlobs = new MemoryBlobCRUD();
    const importAssets = new AssetsManager({ blob: importedBlobs });
    importAssets.getAssets().set(sourceId, sourceBlob);
    const restored = await transformer.fromSnapshot({
      json: snapshot,
      assets: importAssets,
      children: [],
    });

    expect(restored.props).toMatchObject({
      sharePreviewSourceId: sourceId,
      sharePreviewVersion: 1,
    });
    await expect(importedBlobs.get(sourceId)?.text()).resolves.toBe(
      JSON.stringify(validRecord)
    );
  });

  test('leaves ordinary bookmark snapshots free of synthetic detail assets', async () => {
    const blobs = new MemoryBlobCRUD();
    const assets = new AssetsManager({ blob: blobs });
    const transformer = new BookmarkBlockTransformer(new Map());
    const model = {
      id: 'ordinary-bookmark',
      flavour: 'affine:bookmark',
      version: 1,
      role: 'content',
      keys: ['url'],
      props: {
        url: 'https://example.com',
      } satisfies Partial<BookmarkBlockProps>,
      children: [],
    } as never;

    const snapshot = transformer.toSnapshot({ model, assets });
    const restored = await transformer.fromSnapshot({
      json: snapshot,
      assets,
      children: [],
    });

    expect(assets.getPathBlobIdMap()).toEqual(new Map());
    expect(restored.props).not.toHaveProperty('sharePreviewSourceId');
    expect(restored.props).not.toHaveProperty('sharePreviewVersion');
  });

  test('keeps a bookmark when its optional details Blob is missing from otherwise non-empty assets', async () => {
    const assets = new AssetsManager({ blob: new MemoryBlobCRUD() });
    assets
      .getAssets()
      .set('unrelated-blob', new Blob(['unrelated attachment']));
    const transformer = new BookmarkBlockTransformer(new Map());
    const snapshot = {
      id: 'bookmark-with-missing-details',
      flavour: 'affine:bookmark',
      version: 1,
      props: {
        url: validRecord.sourceUrl,
        sharePreviewSourceId: 'missing-details-blob',
        sharePreviewVersion: 1,
      },
      children: [],
    } as never;

    await expect(
      transformer.fromSnapshot({ json: snapshot, assets, children: [] })
    ).resolves.toMatchObject({
      id: 'bookmark-with-missing-details',
      props: {
        sharePreviewSourceId: 'missing-details-blob',
        sharePreviewVersion: 1,
      },
    });
  });
});
