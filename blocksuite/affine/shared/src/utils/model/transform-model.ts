import type { BlockModel, Store, Text } from '@blocksuite/store';

export function transformModel(
  model: BlockModel,
  flavour: string,
  props?: Parameters<Store['addBlock']>[1]
) {
  const doc = model.store;
  const parent = doc.getParent(model);
  if (!parent) {
    return null;
  }
  const blockProps: {
    type?: string;
    text?: Text;
    children?: BlockModel[];
  } = {
    text: model?.text?.clone(), // should clone before `deleteBlock`
    children: model.children,
    ...props,
  };
  const index = parent.children.indexOf(model);

  // Sometimes the new block can not be added due to some reason, e.g. invalid schema check.
  // So we need to try to add the new block first, and if it fails, we will not delete the old block.
  const id = doc.addBlock(flavour, blockProps, parent, index);
  doc.deleteBlock(model, {
    deleteChildren: false,
  });
  return id;
}
