import {
  ParagraphBlockModel,
  type ParagraphType,
} from '@blocksuite/affine-model';
import { matchModels } from '@blocksuite/affine-shared/utils';
import type { BlockStdScope } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';

import { focusTextModel } from '../dom.js';
import { beforeConvert } from './utils.js';

export function toParagraph(
  std: BlockStdScope,
  model: BlockModel,
  type: ParagraphType,
  prefix: string
) {
  const { store: doc } = std;
  if (!matchModels(model, [ParagraphBlockModel])) {
    const parent = doc.getParent(model);
    if (!parent) return;

    const index = parent.children.indexOf(model);

    beforeConvert(std, model, prefix.length);

    const blockProps = {
      type: type,
      text: model.text?.clone(),
      children: model.children,
    };
    doc.deleteBlock(model, { deleteChildren: false });
    const id = doc.addBlock('affine:paragraph', blockProps, parent, index);

    focusTextModel(std, id);
    return id;
  }

  if (matchModels(model, [ParagraphBlockModel]) && model.props.type !== type) {
    beforeConvert(std, model, prefix.length);

    doc.updateBlock(model, { type });

    focusTextModel(std, model.id);
  }

  // If the model is already a paragraph with the same type, do nothing
  return model.id;
}
