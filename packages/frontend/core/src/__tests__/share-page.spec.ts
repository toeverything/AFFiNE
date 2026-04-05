import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  fetchSharedPublishMode,
  getResolvedPublishMode,
  getSearchWithMode,
  parsePublishMode,
} from '../desktop/pages/workspace/share/share-page.utils';

describe('getResolvedPublishMode', () => {
  test('prefers the query mode when it is present', () => {
    expect(getResolvedPublishMode('edgeless', 'page')).toBe('edgeless');
    expect(getResolvedPublishMode('page', 'edgeless')).toBe('page');
  });

  test('falls back to the published public mode for shared docs', () => {
    expect(getResolvedPublishMode(null, 'edgeless')).toBe('edgeless');
    expect(getResolvedPublishMode(null, 'page')).toBe('page');
  });

  test('defaults to page when no mode is available', () => {
    expect(getResolvedPublishMode(null, null)).toBe('page');
    expect(getResolvedPublishMode(null, undefined)).toBe('page');
  });
});

describe('parsePublishMode', () => {
  test('accepts valid publish modes only', () => {
    expect(parsePublishMode('page')).toBe('page');
    expect(parsePublishMode('edgeless')).toBe('edgeless');
    expect(parsePublishMode('invalid')).toBeNull();
    expect(parsePublishMode(null)).toBeNull();
  });
});

describe('fetchSharedPublishMode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('reads publish mode from the HEAD response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { 'publish-mode': 'edgeless' },
      })
    );

    await expect(
      fetchSharedPublishMode({
        serverBaseUrl: 'https://app.affine.pro',
        workspaceId: 'workspace-id',
        docId: 'doc-id',
      })
    ).resolves.toBe('edgeless');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        '/api/workspaces/workspace-id/docs/doc-id',
        'https://app.affine.pro'
      ),
      expect.objectContaining({ method: 'HEAD' })
    );
  });

  test('falls back to GET when HEAD misses the header', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { 'publish-mode': 'page' },
        })
      );

    await expect(
      fetchSharedPublishMode({
        serverBaseUrl: 'https://app.affine.pro',
        workspaceId: 'workspace-id',
        docId: 'doc-id',
      })
    ).resolves.toBe('page');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('getSearchWithMode', () => {
  test('adds mode to an empty search string', () => {
    expect(getSearchWithMode('', 'edgeless')).toBe('?mode=edgeless');
  });

  test('replaces an existing mode and preserves other params', () => {
    expect(getSearchWithMode('?foo=1&mode=page&bar=2', 'edgeless')).toBe(
      '?foo=1&mode=edgeless&bar=2'
    );
  });
});
