import { buildCalendarOAuthRedirectUri } from '@affine/core/desktop/dialogs/setting/account-setting/calendar-oauth-redirect';
import { describe, expect, test } from 'vitest';

describe('buildCalendarOAuthRedirectUri', () => {
  test('builds the workspace integrations settings route from a workspace page', () => {
    expect(
      buildCalendarOAuthRedirectUri(
        'https://app.affine.pro/workspace/workspace-1/all'
      )
    ).toBe(
      'https://app.affine.pro/workspace/workspace-1/settings?tab=workspace%3Aintegrations&scrollAnchor=integration-calendar'
    );
  });

  test('preserves the current app subpath before the workspace route', () => {
    expect(
      buildCalendarOAuthRedirectUri(
        'https://app.affine.pro/app/workspace/workspace-1/collection'
      )
    ).toBe(
      'https://app.affine.pro/app/workspace/workspace-1/settings?tab=workspace%3Aintegrations&scrollAnchor=integration-calendar'
    );
  });

  test('falls back to the current url when no workspace route is present', () => {
    expect(
      buildCalendarOAuthRedirectUri('https://app.affine.pro/sign-in')
    ).toBe('https://app.affine.pro/sign-in');
  });
});
