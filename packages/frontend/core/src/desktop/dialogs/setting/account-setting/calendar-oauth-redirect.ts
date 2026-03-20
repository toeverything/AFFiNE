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
  const redirectUrl = new URL(currentUrl.origin);
  redirectUrl.pathname = `${basePath ? `/${basePath}` : ''}/workspace/${workspaceId}/settings`;
  redirectUrl.searchParams.set('tab', 'workspace:integrations');
  redirectUrl.searchParams.set(
    'scrollAnchor',
    CALENDAR_INTEGRATION_SCROLL_ANCHOR
  );

  return redirectUrl.toString();
}
