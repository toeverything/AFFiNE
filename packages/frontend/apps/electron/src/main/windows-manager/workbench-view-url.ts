import { mainWindowOrigin } from '../../shared/internal-origin';
import type { WorkbenchViewMeta } from '../shared-state-schema';

export function buildWorkbenchViewUrl(
  basename: string,
  path: WorkbenchViewMeta['path']
) {
  // '/' + '/all' is a network-path reference: it changes the assets host to
  // 'all'. Join at a single slash so the tab stays on the internal origin.
  const pathname =
    basename.replace(/\/+$/, '') +
    '/' +
    (path?.pathname ?? '').replace(/^\/+/, '');
  const url = new URL(pathname, mainWindowOrigin);
  url.hash = path?.hash ?? '';
  url.search = path?.search ?? '';
  return url;
}
