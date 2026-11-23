export const TRUSTED_REDIRECT_DOMAINS = [
  'google.com',
  'stripe.com',
  'github.com',
  'twitter.com',
  'discord.gg',
  'youtube.com',
  't.me',
  'reddit.com',
  'affine.pro',
].map(d => d.toLowerCase());

export const ALLOWED_REDIRECT_PROTOCOLS = new Set(['http:', 'https:']);

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/\.$/, '');
}

function hostnameMatchesDomain(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function isAllowedRedirectTarget(
  redirectUri: string,
  options: {
    currentHostname: string;
  }
) {
  const currentHostname = normalizeHostname(options.currentHostname);

  try {
    const target = new URL(redirectUri);

    if (!ALLOWED_REDIRECT_PROTOCOLS.has(target.protocol)) {
      return false;
    }

    const hostname = normalizeHostname(target.hostname);

    if (hostname === currentHostname) {
      return true;
    }

    return TRUSTED_REDIRECT_DOMAINS.some(domain =>
      hostnameMatchesDomain(hostname, domain)
    );
  } catch {
    return false;
  }
}
