import { DebugLogger } from '@affine/debug';
import { isAllowedRedirectTarget } from '@toeverything/infra';
import { type LoaderFunction, Navigate, useLoaderData } from 'react-router-dom';

const logger = new DebugLogger('redirect_proxy');

/**
 * /redirect-proxy page
 *
 * only for web
 */
export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const redirectUri = searchParams.get('redirect_uri');

  if (!redirectUri) {
    return { allow: false };
  }

  if (
    isAllowedRedirectTarget(redirectUri, {
      currentHostname: window.location.hostname,
    })
  ) {
    location.href = redirectUri;
    return { allow: true };
  }

  logger.warn('Blocked redirect to untrusted domain', redirectUri);
  return { allow: false };
};

export const Component = () => {
  const { allow } = useLoaderData() as { allow: boolean };

  if (allow) {
    return null;
  }

  return <Navigate to="/404" />;
};
