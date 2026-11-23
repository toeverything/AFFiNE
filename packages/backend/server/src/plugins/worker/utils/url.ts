import { getDomain, getSubdomain } from 'tldts';

const localhost = new Set(['localhost', '127.0.0.1']);

const URL_FIXERS: Record<string, (url: URL) => URL> = {
  'open.spotify.com': (url: URL) => {
    // with si query, spotify will redirect to landing page which [Open Desktop] check
    url.searchParams.delete('si');
    return url;
  },
};

export function fixUrl(url?: string): URL | null {
  if (typeof url !== 'string') {
    return null;
  }

  let fullUrl = url;

  // don't require // prefix, URL can handle protocol:domain
  if (!url.startsWith('http:') && !url.startsWith('https:')) {
    fullUrl = 'http://' + url;
  }

  try {
    const parsed = new URL(fullUrl);

    const subDomain = getSubdomain(url);
    const mainDomain = getDomain(url);
    const fullDomain = subDomain ? `${subDomain}.${mainDomain}` : mainDomain;

    if (
      ['http:', 'https:'].includes(parsed.protocol) &&
      // check hostname is a valid domain
      (fullDomain === parsed.hostname || localhost.has(parsed.hostname))
    ) {
      const fixer = URL_FIXERS[parsed.hostname];

      if (fixer) {
        return fixer(parsed);
      }

      return parsed;
    }
  } catch {}

  return null;
}

export function appendUrl(url: string | null, array?: string[]) {
  if (url) {
    const fixedUrl = fixUrl(url);
    if (fixedUrl) {
      array?.push(fixedUrl.toString());
    }
  }
}

export async function reduceUrls(urls: string[] = []) {
  return Array.from(new Set(urls.filter(Boolean) as string[]));
}
