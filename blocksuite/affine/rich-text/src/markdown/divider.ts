import {
  DividerBlockModel,
  ParagraphBlockModel,
} from '@blocksuite/affine-model';
import { matchModels } from '@blocksuite/affine-shared/utils';
import type { BlockStdScope } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';

import { focusTextModel } from '../dom.js';
import { beforeConvert } from './utils.js';

export function toDivider(
  std: BlockStdScope,
  model: BlockModel,
  prefix: string
) {
  const { store: doc } = std;
  if (
    matchModels(model, [DividerBlockModel]) ||
    (matchModels(model, [ParagraphBlockModel]) && model.props.type === 'quote')
  ) {
    return;
  }

  const parent = doc.getParent(model);
  if (!parent) return;

  const index = parent.children.indexOf(model);
  beforeConvert(std, model, prefix.length);
  const blockProps = {
    children: model.children,
  };
  doc.addBlock('affine:divider', blockProps, parent, index);

  const nextBlock = parent.children[index + 1];
  let id = nextBlock?.id;
  if (!id) {
    id = doc.addBlock('affine:paragraph', {}, parent);
  }
  focusTextModel(std, id);
  return id;
}
