import { buildWorkspaceSettingsPath } from '@affine/core/components/hooks/use-navigate-helper';

import { CALENDAR_INTEGRATION_SCROLL_ANCHOR } from '../navigation-constants';

export function buildCalendarOAuthRedirectUri(currentHref: string): string {
  let currentUrl: URL;
  try {
    currentUrl = new URL(currentHref);
  } catch {
    return currentHref;
  }

  const pathSegments = currentUrl.pathname.split('/').filter(Boolean);
  const workspaceSegmentIndex = pathSegments.indexOf('workspace');
  const workspaceId = pathSegments[workspaceSegmentIndex + 1];

  if (workspaceSegmentIndex === -1 || !workspaceId) {
    return currentHref;
  }

  const basePath = pathSegments.slice(0, workspaceSegmentIndex).join('/');
  const redirectUrl = new URL(
    buildWorkspaceSettingsPath(workspaceId, {
      tab: 'workspace:integrations',
      scrollAnchor: CALENDAR_INTEGRATION_SCROLL_ANCHOR,
    }),
    currentUrl.origin
  );
  if (basePath) {
    redirectUrl.pathname = `/${basePath}${redirectUrl.pathname}`;
  }

  return redirectUrl.toString();
}
