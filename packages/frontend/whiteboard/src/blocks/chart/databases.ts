import type { Store } from '@blocksuite/affine/store';

import { inferMapping } from './mapping';
import type {
  ChartDataSource,
  ChartDatabaseOption,
  DatabaseColumnMeta,
} from './types';

export function listDatabases(store: Store): ChartDatabaseOption[] {
  return store.getModelsByFlavour('affine:database').map(model => {
    const columns = (
      (model.props.columns as DatabaseColumnMeta[] | undefined) ?? []
    ).map(column => ({
      id: column.id,
      name: column.name,
      type: column.type,
    }));
    const titleProp = model.props.title as { toString?: () => string } | string;
    return {
      id: model.id,
      docId: store.id,
      title:
        (typeof titleProp === 'string' ? titleProp : titleProp?.toString?.()) ||
        model.id,
      columns,
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
  const model = store.getBlock(blockId)?.model;
  const columns = (
    (model?.props.columns as DatabaseColumnMeta[] | undefined) ?? []
  ).map(column => ({
    id: column.id,
    name: column.name,
    type: column.type,
  }));
  const firstRow = model?.children[0];
  const cells = (
    model?.props.cells as
      | Record<string, Record<string, { value?: unknown }>>
      | undefined
  )?.[firstRow?.id ?? ''];
  const sample = Object.fromEntries(
    Object.entries(cells ?? {}).map(([key, cell]) => [key, cell?.value])
  );

  return {
    type: 'database',
    docId: store.id,
    blockId,
    mapping: inferMapping(columns, sample),
  };
}
