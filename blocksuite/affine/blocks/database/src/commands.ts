import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import {
  type DataViewExtensionType,
  getDataViewExtensions,
} from '@blocksuite/data-view';
import { type Command } from '@blocksuite/std';
import type { BlockModel, Store } from '@blocksuite/store';

import {
  DatabaseBlockDataSource,
  databaseViewInitTemplate,
} from './data-source';

export const insertDatabaseBlockCommand: Command<
  {
    selectedModels?: BlockModel[];
    viewType: string;
    place?: 'after' | 'before';
    removeEmptyLine?: boolean;
  },
  {
    insertedDatabaseBlockId: string;
  }
> = (ctx, next) => {
  const { selectedModels, viewType, place, removeEmptyLine, std } = ctx;
  if (!selectedModels?.length) return;

  const targetModel =
    place === 'before'
      ? selectedModels[0]
      : selectedModels[selectedModels.length - 1];

  if (!targetModel) return;

  const result = std.store.addSiblingBlocks(
    targetModel,
    [{ flavour: 'affine:database' }],
    place
  );
  const string = result[0];

  if (string == null) return;

  const extensions = getDataViewExtensions(std.provider);

  initDatabaseBlock({
    doc: std.store,
    model: targetModel,
    databaseId: string,
    extensions,
    viewType,
    isAppendNewRow: false,
  });

  if (removeEmptyLine && targetModel.text?.length === 0) {
    std.store.deleteBlock(targetModel);
  }

  next({ insertedDatabaseBlockId: string });
};

export const initDatabaseBlock = ({
  doc,
  model,
  databaseId,
  viewType,
  extensions = [],
  isAppendNewRow = true,
}: {
  doc: Store;
  model: BlockModel;
  databaseId: string;
  viewType: string;
  extensions?: DataViewExtensionType[];
  isAppendNewRow?: boolean;
}) => {
  const blockModel = doc.getBlock(databaseId)?.model as
    | DatabaseBlockModel
    | undefined;
  if (!blockModel) {
    return;
  }
  const datasource = new DatabaseBlockDataSource({
    model: blockModel,
    extensions,
  });
  databaseViewInitTemplate(datasource, viewType);
  if (isAppendNewRow) {
    const parent = doc.getParent(model);
    if (!parent) return;
    doc.addBlock('affine:paragraph', {}, parent.id);
  }
};
