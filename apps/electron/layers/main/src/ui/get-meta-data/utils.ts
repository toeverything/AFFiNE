import urlparse from 'url';

export function makeUrlAbsolute(base: string, relative: string): string {
  const relativeParsed = urlparse.parse(relative);

  if (relativeParsed.host === null) {
    return urlparse.resolve(base, relative);
  }

  return relative;
}

export function makeUrlSecure(url: string): string {
  return url.replace(/^http:/, 'https:');
}

export function parseUrl(url: string): string {
  return urlparse.parse(url).hostname || '';
}

export function getProvider(host: string): string {
  return host
    .replace(/www[a-zA-Z0-9]*\./, '')
    .replace('.co.', '.')
    .split('.')
    .slice(0, -1)
    .join(' ');
}
