import type { ReferenceParams } from '@blocksuite/blocks';
import { isNil, pick, pickBy } from 'lodash-es';
import type { ParsedQuery, ParseOptions } from 'query-string';
import queryString from 'query-string';

function maybeAffineOrigin(origin: string) {
  return (
    origin.startsWith('file://') ||
    origin.startsWith('affine://') ||
    origin.endsWith('affine.pro') || // stable/beta
    origin.endsWith('affine.fail') || // canary
    origin.includes('localhost') // dev
  );
}

export const resolveRouteLinkMeta = (href: string) => {
  try {
    const url = new URL(href, location.origin);

    // check if origin is one of affine's origins

    if (!maybeAffineOrigin(url.origin)) {
      return null;
    }

    // http://---/workspace/{workspaceid}/xxx/yyy
    // http://---/workspace/{workspaceid}/xxx
    const [_, workspaceId, moduleName, subModuleName] =
      url.pathname.match(/\/workspace\/([^/]+)\/([^/]+)(?:\/([^/]+))?/) || [];

    if (workspaceId) {
      const basename = `/workspace/${workspaceId}`;
      const pathname = url.pathname.replace(basename, '');
      const search = url.search;
      const hash = url.hash;
      const location = {
        pathname,
        search,
        hash,
      };
      if (isRouteModulePath(moduleName)) {
        return {
          location,
          basename,
          workspaceId,
          moduleName,
          subModuleName,
        };
      } else if (moduleName) {
        // for now we assume all other cases are doc links
        return {
          location,
          basename,
          workspaceId,
          moduleName: 'doc' as const,
          docId: moduleName,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
};

export const isLink = (href: string) => {
  try {
    const hasScheme = href.match(/^https?:\/\//);

    if (!hasScheme) {
      const dotIdx = href.indexOf('.');
      if (dotIdx > 0 && dotIdx < href.length - 1) {
        href = `https://${href}`;
      }
    }

    return Boolean(URL.canParse?.(href) ?? new URL(href));
  } catch {
    return null;
  }
};

/**
 * @see /packages/frontend/core/src/router.tsx
 */
export const routeModulePaths = ['all', 'collection', 'tag', 'trash'] as const;
export type RouteModulePath = (typeof routeModulePaths)[number];

const isRouteModulePath = (
  path: string
): path is (typeof routeModulePaths)[number] =>
  routeModulePaths.includes(path as any);

export const resolveLinkToDoc = (href: string) => {
  const meta = resolveRouteLinkMeta(href);
  if (!meta || meta.moduleName !== 'doc') return null;

  const params = preprocessParams(
    queryString.parse(meta.location.search, paramsParseOptions)
  );

  return {
    ...pick(meta, ['workspaceId', 'docId']),
    ...params,
  };
};

export const preprocessParams = (
  params: ParsedQuery<string>
): ReferenceParams & { refreshKey?: string } => {
  const result: ReferenceParams & { refreshKey?: string } = pickBy(
    params,
    value => {
      if (isNil(value)) return false;
      if (typeof value === 'string' && value.length === 0) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }
  );

  if (result.blockIds?.length) {
    result.blockIds = result.blockIds.filter(v => v.length);
  }
  if (result.elementIds?.length) {
    result.elementIds = result.elementIds.filter(v => v.length);
  }

  return pick(result, ['mode', 'blockIds', 'elementIds', 'refreshKey']);
};

export const paramsParseOptions: ParseOptions = {
  // Cannot handle single id situation correctly: `blockIds=xxx`
  arrayFormat: 'none',
  types: {
    mode: value =>
      value === 'page' || value === 'edgeless' ? value : undefined,
    blockIds: value =>
      value.length ? value.split(',').filter(v => v.length) : [],
    elementIds: value =>
      value.length ? value.split(',').filter(v => v.length) : [],
    refreshKey: 'string',
  },
};
