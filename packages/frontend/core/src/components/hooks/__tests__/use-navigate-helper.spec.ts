/**
 * @vitest-environment happy-dom
 */

import { describe, expect, test } from 'vitest';

import {
  buildWorkspaceSettingsPath,
  buildWorkspaceSettingsRedirectUri,
} from '../use-navigate-helper';

describe('use-navigate-helper utilities', () => {
  test('buildWorkspaceSettingsPath includes tab and scroll anchor', () => {
    expect(
      buildWorkspaceSettingsPath('workspace-1', {
        tab: 'workspace:integrations',
        scrollAnchor: 'integration-calendar',
      })
    ).toBe(
      '/workspace/workspace-1/settings?tab=workspace%3Aintegrations&scrollAnchor=integration-calendar'
    );
  });

  test('buildWorkspaceSettingsRedirectUri builds a settings redirect from a workspace page', () => {
    expect(
      buildWorkspaceSettingsRedirectUri(
        'https://app.affine.pro/workspace/workspace-1/all',
        {
          tab: 'workspace:integrations',
          scrollAnchor: 'integration-calendar',
        }
      )
    ).toBe(
      'https://app.affine.pro/workspace/workspace-1/settings?tab=workspace%3Aintegrations&scrollAnchor=integration-calendar'
    );
  });

  test('buildWorkspaceSettingsRedirectUri preserves app subpaths before the workspace route', () => {
    expect(
      buildWorkspaceSettingsRedirectUri(
        'https://app.affine.pro/app/workspace/workspace-1/collection',
        {
          tab: 'workspace:integrations',
          scrollAnchor: 'integration-calendar',
        }
      )
    ).toBe(
      'https://app.affine.pro/app/workspace/workspace-1/settings?tab=workspace%3Aintegrations&scrollAnchor=integration-calendar'
    );
  });

  test('buildWorkspaceSettingsRedirectUri falls back to the current url when no workspace route is present', () => {
    expect(
      buildWorkspaceSettingsRedirectUri('https://app.affine.pro/sign-in', {
        tab: 'workspace:integrations',
      })
    ).toBe('https://app.affine.pro/sign-in');
  });
});
