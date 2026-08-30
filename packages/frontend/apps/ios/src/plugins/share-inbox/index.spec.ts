/** @vitest-environment happy-dom */

import { describe, expect, test, vi } from 'vitest';

import {
  resolveShareInboxAttachment,
  sanitizeShareInboxEntries,
} from './index';

const resolved = {
  itemId: 'item',
  fileUrl: 'file:///safe/image.png',
  relativePath: 'item/image.png',
  name: 'image.png',
  mimeType: 'image/png',
  size: 3,
};

describe('resolveShareInboxAttachment', () => {
  test.each([
    [{ ...resolved, itemId: 'other' }, 'mismatched item'],
    [{ ...resolved, fileUrl: undefined }, 'missing file URL'],
    [{ ...resolved, relativePath: undefined }, 'missing relative path'],
    [{ ...resolved, mimeType: undefined }, 'missing MIME'],
    [{ ...resolved, name: undefined }, 'missing name'],
    [{ ...resolved, size: undefined }, 'missing size'],
    [{ ...resolved, size: 0 }, 'empty size'],
  ])('does not fetch %s', async (value, _description) => {
    const fetchFile = vi.fn();
    await expect(
      resolveShareInboxAttachment('item', value, {
        convertFileSrc: value => value,
        fetchFile,
      })
    ).resolves.toBeUndefined();
    expect(fetchFile).not.toHaveBeenCalled();
  });

  test('rejects missing and non-ok native file responses', async () => {
    const fetchFile = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const options = { convertFileSrc: (value: string) => value, fetchFile };
    await expect(
      resolveShareInboxAttachment('item', resolved, options)
    ).resolves.toBeUndefined();
    await expect(
      resolveShareInboxAttachment('item', resolved, options)
    ).resolves.toBeUndefined();
  });

  test('rejects a size mismatch', async () => {
    await expect(
      resolveShareInboxAttachment('item', resolved, {
        convertFileSrc: value => value,
        fetchFile: vi.fn().mockResolvedValue(new Response(new Blob(['four']))),
      })
    ).resolves.toBeUndefined();
  });

  test('returns a byte-preserving File without data URLs or FileReader', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchFile = vi
      .fn()
      .mockResolvedValue(
        new Response(new Blob([bytes], { type: 'application/octet-stream' }))
      );
    const file = await resolveShareInboxAttachment('item', resolved, {
      convertFileSrc: value => `capacitor://${value}`,
      fetchFile,
    });

    expect(file).toBeInstanceOf(File);
    expect(file && new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
    expect(file).toMatchObject({
      name: 'image.png',
      type: 'image/png',
      size: 3,
    });
    expect(fetchFile).toHaveBeenCalledWith(
      'capacitor://file:///safe/image.png'
    );
  });
});

describe('sanitizeShareInboxEntries', () => {
  const ready = (preview: unknown) => [
    {
      status: 'ready' as const,
      item: {
        id: 'item',
        documentId: 'doc',
        schemaVersion: 3 as const,
        importAttemptId: 'attempt',
        title: 'Shared',
        content: { kind: 'url' as const, url: 'https://example.com' },
        preview,
      },
    },
  ];

  test('preserves a valid native preview snapshot', () => {
    const preview = {
      url: 'https://example.com',
      title: 'Preview',
      images: ['https://app.affine.pro/api/worker/image-proxy?url=thumbnail'],
    };

    expect(sanitizeShareInboxEntries(ready(preview))[0]).toMatchObject({
      status: 'ready',
      item: { preview },
    });
  });

  test('drops a malformed preview but preserves its inbox item', () => {
    const [entry] = sanitizeShareInboxEntries(
      ready({ url: 'https://user:password@example.com' })
    );

    expect(entry).toMatchObject({
      status: 'ready',
      item: { id: 'item', content: { url: 'https://example.com' } },
    });
    expect(entry?.status === 'ready' && entry.item.preview).toBeUndefined();
  });
});
