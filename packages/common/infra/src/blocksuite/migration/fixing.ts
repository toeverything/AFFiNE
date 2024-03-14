import type { Doc as YDoc, Map as YMap } from 'yjs';
import { transact } from 'yjs';

/**
 * Hard code to fix workspace version to be compatible with legacy data.
 * Let e2e to ensure the data version is correct.
 */
export function fixWorkspaceVersion(rootDoc: YDoc) {
  const meta = rootDoc.getMap('meta') as YMap<unknown>;

  /**
   * It doesn't matter to upgrade workspace version from 1 or undefined to 2.
   * Blocksuite just set the value, do nothing else.
   */
  function doFix() {
    if (meta.size === 0) {
      return;
    }
    const workspaceVersion = meta.get('workspaceVersion');
    if (typeof workspaceVersion !== 'number' || workspaceVersion < 2) {
      transact(
        rootDoc,
        () => {
          meta.set('workspaceVersion', 2);
        },
        'fixWorkspaceVersion',
        // transact as remote update, because blocksuite will skip local changes.
        false
      );
    }
    const pageVersion = meta.get('pageVersion');
    if (typeof pageVersion !== 'number' || pageVersion < 2) {
      transact(
        rootDoc,
        () => {
          meta.set('pageVersion', 2);
        },
        'fixPageVersion',
        // transact as remote update, because blocksuite will skip local changes.
        false
      );
    }
  }

  doFix();

  // do fix every time when meta changed
  meta.observe(() => doFix());
}
