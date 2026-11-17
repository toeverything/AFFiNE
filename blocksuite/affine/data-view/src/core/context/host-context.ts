import { createIdentifier } from '@blocksuite/global/di';
import type { EditorHost } from '@blocksuite/std';

/**
 * Lets any `data-view` component (core renderers, or a consuming block
 * package's own cell renderers) reach the real `EditorHost` via
 * `view.serviceGet(EditorHostKey)`/`dataSource.serviceGet(...)` — defined
 * here (not in `@blocksuite/affine-block-database`) so `data-view`'s own
 * core view-preset renderers (e.g. list view's row-level actions) can use
 * the same identifier without a backwards dependency on a block package
 * that itself depends on `data-view`.
 */
export const EditorHostKey = createIdentifier<EditorHost>('editor-host');

/**
 * The host whose `store` actually OWNS this data source's row blocks —
 * which is not always the one behind `EditorHostKey`.
 *
 * `EditorHostKey` is deliberately bound to the *outer page's* host (see
 * `database-block.ts`'s own `dataSource` init comment), because row actions
 * that insert blocks "on the current page" (Story 2.6's note-linking, peek
 * view, settings reads) must target the page the user is actually looking
 * at. But when an `affine-database` is rendered *nested*, inside a
 * `database-ref`/`database-view-ref` preview scope over another doc's
 * backing store, that outer store contains none of the row blocks:
 * `outerHost.std.store.getBlock(rowId)` returns `undefined` for every row.
 *
 * Any code that needs the row's own `BlockModel` — or that runs a block
 * command against it (`splitListCommand`, `mergeWithPrev`, `moveBlocks`) —
 * must therefore resolve its host through THIS key, not `EditorHostKey`.
 * Reading rows through the outer host is what made cross-doc Enter silently
 * see every row as empty (undefined model -> `text?.length ?? 0` === 0) and
 * unindent it instead of splitting it.
 */
export const RowHostKey = createIdentifier<EditorHost>('data-view-row-host');
