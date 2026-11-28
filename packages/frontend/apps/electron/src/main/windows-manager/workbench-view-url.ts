import { posix } from 'node:path';

import { mainWindowOrigin } from '../../shared/internal-origin';
import type { WorkbenchViewMeta } from '../shared-state-schema';

export function getWorkbenchViewUrl(
  basename: string,
  path: WorkbenchViewMeta['path']
) {
  const url = new URL(mainWindowOrigin);
  const pathname = posix.join(basename, path?.pathname ?? '');
  // An All Docs tab saved without a workspace must go through the landing page.
  url.pathname = pathname === '/all' || pathname === '/all/' ? '/' : pathname;
  url.search = path?.search ?? '';
  url.hash = path?.hash ?? '';
  return url.href;
}
