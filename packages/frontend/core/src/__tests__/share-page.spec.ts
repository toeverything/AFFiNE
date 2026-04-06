import { UserFriendlyError } from '@affine/error';
import { TimeoutError } from 'rxjs';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  fetchSharedPublishMode,
  getResolvedPublishMode,
  getSearchWithMode,
  isSharePagePermissionError,
  isSharePageTimeoutError,
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
        '/api/workspaces/workspace-id/public-docs/doc-id',
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

describe('share page error helpers', () => {
  test('recognizes permission errors only', () => {
    const permissionError = new UserFriendlyError({
      status: 403,
      code: 'DOC_ACTION_DENIED',
      type: 'DOC_ACTION_DENIED',
      name: 'DOC_ACTION_DENIED',
      message: 'forbidden',
    });

    expect(isSharePagePermissionError(permissionError)).toBe(true);
    expect(isSharePagePermissionError(new TimeoutError())).toBe(false);
    expect(isSharePagePermissionError(new Error('x'))).toBe(false);
  });

  test('recognizes timeout errors only', () => {
    expect(isSharePageTimeoutError(new TimeoutError())).toBe(true);
    expect(
      isSharePageTimeoutError(
        new UserFriendlyError({
          status: 403,
          code: 'DOC_ACTION_DENIED',
          type: 'DOC_ACTION_DENIED',
          name: 'DOC_ACTION_DENIED',
          message: 'forbidden',
        })
      )
    ).toBe(false);
  });
});
