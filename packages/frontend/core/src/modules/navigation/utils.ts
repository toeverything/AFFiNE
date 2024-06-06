function maybeAffineOrigin(origin: string) {
  return (
    origin.startsWith('file://.') ||
    origin.startsWith('affine://') ||
    origin.endsWith('affine.pro') || // stable/beta
    origin.endsWith('affine.fail') || // canary
    origin.includes('localhost') // dev
  );
}

export const resolveLinkToDoc = (href: string) => {
  try {
    const url = new URL(href, location.origin);

    // check if origin is one of affine's origins

    if (!maybeAffineOrigin(url.origin)) {
      return null;
    }

    // http://xxx/workspace/48__RTCSwASvWZxyAk3Jw/-Uge-K6SYcAbcNYfQ5U-j#xxxx
    // to { workspaceId: '48__RTCSwASvWZxyAk3Jw', docId: '-Uge-K6SYcAbcNYfQ5U-j', blockId: 'xxxx' }

    const [_, workspaceId, docId, blockId] =
      url.toString().match(/\/workspace\/([^/]+)\/([^#]+)(?:#(.+))?/) || [];

    /**
     * @see /packages/frontend/core/src/router.tsx
     */
    const excludedPaths = ['all', 'collection', 'tag', 'trash'];

    if (!docId || excludedPaths.includes(docId)) {
      return null;
    }

    return { workspaceId, docId, blockId };
  } catch {
    return null;
  }
};
