import { DebugLogger } from '@affine/debug';
import { type LoaderFunction, Navigate, useLoaderData } from 'react-router-dom';

const trustedDomain = [
  'google.com',
  'stripe.com',
  'github.com',
  'twitter.com',
  'discord.gg',
  'youtube.com',
  't.me',
  'reddit.com',
  'affine.pro',
];

const logger = new DebugLogger('redirect_proxy');
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

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

  try {
    const target = new URL(redirectUri);

    if (!ALLOWED_PROTOCOLS.has(target.protocol)) {
      logger.warn('Blocked redirect with disallowed protocol', target.protocol);
      return { allow: false };
    }

    if (
      target.hostname === window.location.hostname ||
      trustedDomain.some(domain =>
        new RegExp(`.?${domain}$`).test(target.hostname)
      )
    ) {
      location.href = redirectUri;
      return { allow: true };
    }
  } catch (e) {
    logger.error('Failed to parse redirect uri', e);
    return { allow: false };
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
