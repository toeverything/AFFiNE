import { describe, expect, it } from 'vitest';

import { getWorkbenchViewUrl } from '../../src/main/windows-manager/workbench-view-url';

describe('getWorkbenchViewUrl', () => {
  it('opens the workspace landing page for an All Docs tab with no workspace', () => {
    expect(getWorkbenchViewUrl('/', { pathname: '/all' })).toBe('assets://./');
  });

  it('keeps other root-level routes on the desktop origin', () => {
    expect(getWorkbenchViewUrl('/', { pathname: '/settings' })).toBe(
      'assets://./settings'
    );
  });

  it('preserves a workspace route, query, and fragment', () => {
    expect(
      getWorkbenchViewUrl('/workspace/example', {
        pathname: '/all',
        search: '?tab=recent',
        hash: '#docs',
      })
    ).toBe('assets://./workspace/example/all?tab=recent#docs');
  });
});
