import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import type { DataViewDataType } from '@blocksuite/data-view';
import { createIdentifier } from '@blocksuite/global/di';
import type { ReadonlySignal } from '@preact/signals-core';

/**
 * Lets a `DatabaseBlockDataSource` resolve its views from somewhere other
 * than the canonical database block's own shared `props.views` — set via
 * `dataSource.serviceSet(DatabaseViewLocalOverrideProvider, ...)` the same
 * way `EditorHostKey`/etc. are already injected (see `host-context.ts`).
 *
 * Exists for `affine:database-view-ref` (a reference block that needs its
 * own independent view/filter configuration, separate from the canonical's
 * shared `views` array and from every other reference to the same
 * canonical) — without this seam, any view/filter edit made through such a
 * reference would mutate the one shared `views` array, visible from every
 * other reference and the canonical doc itself.
 */
export interface DatabaseViewLocalOverride {
  viewDataList$: ReadonlySignal<DataViewDataType[]>;
  viewDataGet(viewId: string): DataViewDataType | undefined;
  viewDataAdd(viewData: DataViewDataType): string;
  viewDataDelete(viewId: string): void;
  viewDataDuplicate(id: string): string;
  viewDataMoveTo(id: string, position: InsertToPosition): void;
  viewDataUpdate<ViewData extends DataViewDataType>(
    id: string,
    updater: (data: ViewData) => Partial<ViewData>
  ): void;
}

export const DatabaseViewLocalOverrideProvider =
  createIdentifier<DatabaseViewLocalOverride>('database-view-local-override');
