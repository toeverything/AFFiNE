import type { DatabaseViewLocalOverride } from '@blocksuite/affine-block-database';
import type { DatabaseViewRefBlockModel } from '@blocksuite/affine-model';
import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import { insertPositionToIndex } from '@blocksuite/affine-shared/utils';
import type { DataViewDataType } from '@blocksuite/data-view';
import { computed } from '@preact/signals-core';

/**
 * Backs `DatabaseViewLocalOverrideProvider` (see `@blocksuite/affine-block-
 * database`'s `context/view-local-override-context.ts` for why this seam
 * exists) with this specific `affine:database-view-ref` reference's own
 * local `views`/`currentViewId` props — never the canonical database's.
 *
 * Mirrors `blocks/database/src/utils/block-utils.ts`'s `deleteView`/
 * `duplicateView`/`moveViewTo` semantics as closely as possible (same
 * capture/transact discipline, same duplicate-via-JSON-clone approach for
 * a fresh id), reimplemented rather than imported since those functions'
 * types are hardcoded to `DatabaseBlockModel` specifically, not generic
 * over "any model with a `views` prop".
 */
export function createLocalViewOverride(
  model: DatabaseViewRefBlockModel
): DatabaseViewLocalOverride {
  const viewDataList$ = computed(
    () => model.props.views$.value as DataViewDataType[]
  );

  return {
    viewDataList$,
    viewDataGet(viewId: string) {
      return viewDataList$.value.find(v => v.id === viewId);
    },
    viewDataAdd(viewData: DataViewDataType) {
      model.store.captureSync();
      model.store.transact(() => {
        model.props.views = [...model.props.views, viewData];
      });
      return viewData.id;
    },
    viewDataDelete(viewId: string) {
      model.store.captureSync();
      model.store.transact(() => {
        model.props.views = model.props.views.filter(v => v.id !== viewId);
      });
    },
    viewDataDuplicate(id: string) {
      const newId = model.store.workspace.idGenerator();
      model.store.captureSync();
      model.store.transact(() => {
        const index = model.props.views.findIndex(v => v.id === id);
        const view = model.props.views[index];
        if (view) {
          const next = [...model.props.views];
          next.splice(
            index + 1,
            0,
            JSON.parse(JSON.stringify({ ...view, id: newId }))
          );
          model.props.views = next;
        }
      });
      return newId;
    },
    viewDataMoveTo(id: string, position: InsertToPosition) {
      model.store.captureSync();
      model.store.transact(() => {
        const views = [...model.props.views];
        const fromIndex = views.findIndex(v => v.id === id);
        if (fromIndex === -1) return;
        const [item] = views.splice(fromIndex, 1);
        const toIndex = insertPositionToIndex(position, views);
        views.splice(toIndex, 0, item);
        model.props.views = views;
      });
    },
    viewDataUpdate<ViewData extends DataViewDataType>(
      id: string,
      updater: (data: ViewData) => Partial<ViewData>
    ) {
      model.store.captureSync();
      model.store.transact(() => {
        model.props.views = model.props.views.map(v =>
          v.id === id ? { ...v, ...updater(v as ViewData) } : v
        );
      });
    },
  };
}
