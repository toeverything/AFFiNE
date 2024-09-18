import { appInfo } from '@affine/electron-api';
import { isNil } from 'lodash-es';

interface AppUrlOptions {
  desktop?: boolean | string;
  openInHiddenWindow?: boolean;
  redirectFromWeb?: boolean;
}

export function buildAppUrl(path: string, opts: AppUrlOptions = {}) {
  // TODO(@EYHN): should use server base url
  const webBase = BUILD_CONFIG.serverUrlPrefix;
  // TODO(@pengx17): how could we know the corresponding app schema in web environment
  if (opts.desktop && appInfo?.schema) {
    const urlCtor = new URL(path, webBase);

    if (opts.openInHiddenWindow) {
      urlCtor.searchParams.set('hidden', 'true');
    }

    const url = `${appInfo.schema}://${urlCtor.pathname}${urlCtor.search}`;

    if (opts.redirectFromWeb) {
      const redirect_uri = new URL('/open-app/url', webBase);
      redirect_uri.searchParams.set('url', url);

      return redirect_uri.toString();
    }

    return url;
  } else {
    return new URL(path, webBase).toString();
  }
}

export function toURLSearchParams(
  params?: Partial<Record<string, string | string[]>>
) {
  if (!params) return;

  const items = Object.entries(params)
    .filter(([_, v]) => !isNil(v))
    .filter(([_, v]) => {
      if (typeof v === 'string') {
        return v.length > 0;
      }
      if (Array.isArray(v)) {
        return v.length > 0;
      }
      return false;
    }) as [string, string | string[]][];

  return new URLSearchParams(
    items.map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])
  );
}
