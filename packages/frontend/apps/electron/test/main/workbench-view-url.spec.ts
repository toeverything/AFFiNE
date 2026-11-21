import { describe, expect, it } from 'vitest';

import { buildWorkbenchViewUrl } from '../../src/main/windows-manager/workbench-view-url';
import { isInternalUrl } from '../../src/shared/internal-origin';

describe('workbench view URLs', () => {
  it.each([
    ['/', '/all', '/all'],
    ['', '/all', '/all'],
    ['/', '', '/'],
    ['/workspace/test', '/all', '/workspace/test/all'],
    ['/workspace/test/', '/all', '/workspace/test/all'],
    ['/', '//external.example/path', '/external.example/path'],
  ])(
    'joins %j and %j without changing the assets host',
    (base, path, expected) => {
      const url = buildWorkbenchViewUrl(base, { pathname: path });
      expect(url.protocol).toBe('assets:');
      expect(url.hostname).toBe('.');
      expect(url.pathname).toBe(expected);
      expect(isInternalUrl(url.href)).toBe(true);
    }
  );

  it('keeps the query and fragment on the view URL', () => {
    expect(
      buildWorkbenchViewUrl('/', {
        pathname: '/all',
        search: '?mode=page',
        hash: '#block',
      }).href
    ).toBe('assets://./all?mode=page#block');
  });

  it('loads the root when no path has been saved', () => {
    expect(buildWorkbenchViewUrl('/', undefined).href).toBe('assets://./');
  });
});
