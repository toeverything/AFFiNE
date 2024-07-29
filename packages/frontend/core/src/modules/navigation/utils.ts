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

    const hash = url.hash;
    const pathname = url.pathname;

    // http://---/workspace/{workspaceid}/xxx/yyy
    // http://---/workspace/{workspaceid}/xxx
    const [_, workspaceId, moduleName, subModuleName] =
      pathname.match(/\/workspace\/([^/]+)\/([^/]+)(?:\/([^/]+))?/) || [];

    if (isRouteModulePath(moduleName)) {
      return {
        workspaceId,
        moduleName,
        subModuleName,
      };
    } else if (moduleName) {
      // for now we assume all other cases are doc links
      return {
        workspaceId,
        moduleName: 'doc' as const,
        docId: moduleName,
        blockId: hash.slice(1),
      };
    }
    return;
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
  return {
    workspaceId: meta.workspaceId,
    docId: meta.docId,
    blockId: meta.blockId,
  };
};
