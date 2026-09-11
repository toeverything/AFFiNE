import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import type { Store } from '@blocksuite/affine/store';

import { inferMapping } from './mapping';
import type {
  ChartDatabaseOption,
  ChartDataSource,
  DatabaseColumnMeta,
  DatabaseViewMeta,
} from './types';
import type { DatabaseViewSnapshot, FilterGroup } from './view-filter';

/** Narrow a block to `affine:database` without casting `props` field by field. */
export function asDatabaseModel(
  store: Store,
  blockId: string | undefined
): DatabaseBlockModel | null {
  if (!blockId) return null;
  const model = store.getBlock(blockId)?.model;
  if (!model || model.flavour !== 'affine:database') return null;
  return model as DatabaseBlockModel;
}

export function databaseColumns(
  model: DatabaseBlockModel
): DatabaseColumnMeta[] {
  return model.props.columns.map(column => ({
    id: column.id,
    name: column.name,
    type: column.type,
  }));
}

/** Views a chart can bind to, so `dataSource.viewId` can reuse a saved filter. */
export function databaseViews(model: DatabaseBlockModel): DatabaseViewMeta[] {
  return model.props.views.map(view => ({
    id: view.id,
    name: view.name,
  }));
}

/**
 * View metadata the chart can evaluate on its own. `filter` and `columns` are
 * declared by the view presets (`data-view/view-presets/*/ /*define.ts`) but are not
 * part of the shared `ViewBasicDataType`, so they are read defensively.
 */
export function snapshotDatabaseView(
  model: DatabaseBlockModel,
  viewId: string | undefined
): DatabaseViewSnapshot | undefined {
  if (!viewId) return undefined;
  const view = model.props.views.find(candidate => candidate.id === viewId);
  if (!view) return undefined;

  const extended = view as typeof view & {
    filter?: FilterGroup;
    columns?: Array<{ id: string; hide?: boolean }>;
  };
  const columns = extended.columns ?? [];

  return {
    id: view.id,
    name: view.name,
    mode: view.mode,
    filter: extended.filter,
    hiddenColumnIds: columns
      .filter(column => column.hide)
      .map(column => column.id),
    columnOrder: columns.map(column => column.id),
  };
}

export function listDatabases(store: Store): ChartDatabaseOption[] {
  return store.getModelsByFlavour('affine:database').map(block => {
    const model = block as DatabaseBlockModel;
    return {
      id: model.id,
      docId: store.id,
      title: model.props.title?.toString() || model.id,
      columns: databaseColumns(model),
      views: databaseViews(model),
    };
  });
}

export function findNearbyDatabaseId(
  store: Store,
  modelId: string
): string | undefined {
  const model = store.getBlock(modelId)?.model;
  if (!model) return store.getModelsByFlavour('affine:database')[0]?.id;
  if (model.flavour === 'affine:database') return model.id;
  const parent = store.getParent(model);
  if (parent?.flavour === 'affine:database') return parent.id;
  return store.getModelsByFlavour('affine:database')[0]?.id;
}

export function dataSourceFromDatabase(
  store: Store,
  blockId: string
): ChartDataSource {
  const model = asDatabaseModel(store, blockId);
  const columns = model ? databaseColumns(model) : [];
  const firstRow = model?.children[0];
  const cells = firstRow ? model?.props.cells[firstRow.id] : undefined;
  const sample = Object.fromEntries(
    Object.entries(cells ?? {}).map(([key, cell]) => [key, cell?.value])
  );

  return {
    type: 'database',
    docId: store.id,
    blockId,
    viewId: model?.props.views[0]?.id,
    mapping: inferMapping(columns, sample),
  };
}
