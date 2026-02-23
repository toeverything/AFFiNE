import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockBase64ToUint8Array, mockConvertFileSrc } = vi.hoisted(() => ({
  mockBase64ToUint8Array: vi.fn((data: string) =>
    Uint8Array.from(data.split('').map(char => char.charCodeAt(0)))
  ),
  mockConvertFileSrc: vi.fn((path: string) => `capacitor://localhost${path}`),
}));

vi.mock('@affine/core/modules/workspace-engine', () => ({
  base64ToUint8Array: mockBase64ToUint8Array,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    convertFileSrc: mockConvertFileSrc,
  },
}));

import { decodePayload, MOBILE_BLOB_FILE_PREFIX } from './payload';

describe('decodePayload', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    mockBase64ToUint8Array.mockClear();
    mockConvertFileSrc.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('decodes inline base64 payloads without file IO', async () => {
    const decoded = await decodePayload('ZGF0YQ==', MOBILE_BLOB_FILE_PREFIX);
    expect(decoded).toEqual(Uint8Array.from([90, 71, 70, 48, 89, 81, 61, 61]));
    expect(mockBase64ToUint8Array).toHaveBeenCalledWith('ZGF0YQ==');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads valid cache file tokens', async () => {
    const expected = Uint8Array.from([1, 2, 3, 4]);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => expected.buffer,
    } as Response);

    const path =
      '/var/mobile/Containers/Data/Application/abc/Library/Caches/nbstore-blob-cache/0123456789abcdef/fedcba9876543210.blob';
    const decoded = await decodePayload(
      `${MOBILE_BLOB_FILE_PREFIX}${path}`,
      MOBILE_BLOB_FILE_PREFIX
    );

    expect(decoded).toEqual(expected);
    expect(mockConvertFileSrc).toHaveBeenCalledWith(`file://${path}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads valid android cache file tokens', async () => {
    const expected = Uint8Array.from([4, 3, 2, 1]);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => expected.buffer,
    } as Response);

    const path =
      '/data/user/0/com.affine.app/cache/nbstore-blob-cache/0123456789abcdef/fedcba9876543210.blob';
    const decoded = await decodePayload(
      `${MOBILE_BLOB_FILE_PREFIX}${path}`,
      MOBILE_BLOB_FILE_PREFIX
    );

    expect(decoded).toEqual(expected);
    expect(mockConvertFileSrc).toHaveBeenCalledWith(`file://${path}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects suffix-only paths outside expected cache shape', async () => {
    const path =
      '/attacker/nbstore-blob-cache/0123456789abcdef/fedcba9876543210.blob';
    await expect(
      decodePayload(
        `${MOBILE_BLOB_FILE_PREFIX}${path}`,
        MOBILE_BLOB_FILE_PREFIX
      )
    ).rejects.toThrow('Refusing to read mobile payload outside cache dir');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects random cache roots', async () => {
    const path =
      '/random/cache/nbstore-blob-cache/0123456789abcdef/fedcba9876543210.blob';
    await expect(
      decodePayload(
        `${MOBILE_BLOB_FILE_PREFIX}${path}`,
        MOBILE_BLOB_FILE_PREFIX
      )
    ).rejects.toThrow('Refusing to read mobile payload outside cache dir');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects encoded traversal segments', async () => {
    const path =
      '/var/mobile/Containers/Data/Application/abc/Library/Caches/nbstore-blob-cache/%2E%2E/fedcba9876543210.blob';
    await expect(
      decodePayload(
        `${MOBILE_BLOB_FILE_PREFIX}${path}`,
        MOBILE_BLOB_FILE_PREFIX
      )
    ).rejects.toThrow('Refusing to read mobile payload outside cache dir');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries once with refreshed payload when token read fails', async () => {
    const path =
      '/var/mobile/Containers/Data/Application/abc/Library/Caches/nbstore-blob-cache/0123456789abcdef/fedcba9876543210.blob';
    const payload = `${MOBILE_BLOB_FILE_PREFIX}${path}`;
    const expected = Uint8Array.from([9, 8, 7]);

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => expected.buffer,
      } as Response);

    const reloadedPayload = vi.fn(async () => payload);
    const decoded = await decodePayload(payload, MOBILE_BLOB_FILE_PREFIX, {
      onTokenReadFailure: reloadedPayload,
    });

    expect(decoded).toEqual(expected);
    expect(reloadedPayload).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
