import { PublicDocMode } from '@affine/graphql';
import { describe, expect, test } from 'vitest';

import {
  getResolvedPublishMode,
  getSearchWithMode,
} from '../desktop/pages/workspace/share/share-page.utils';

describe('getResolvedPublishMode', () => {
  test('prefers the query mode when it is present', () => {
    expect(getResolvedPublishMode('edgeless', PublicDocMode.Page)).toBe(
      'edgeless'
    );
    expect(getResolvedPublishMode('page', PublicDocMode.Edgeless)).toBe('page');
  });

  test('falls back to the published public mode for shared docs', () => {
    expect(getResolvedPublishMode(null, PublicDocMode.Edgeless)).toBe(
      'edgeless'
    );
    expect(getResolvedPublishMode(null, PublicDocMode.Page)).toBe('page');
  });

  test('defaults to page when no mode is available', () => {
    expect(getResolvedPublishMode(null, null)).toBe('page');
    expect(getResolvedPublishMode(null, undefined)).toBe('page');
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
