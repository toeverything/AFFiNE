import type {
  BlockComponent,
  EditorHost,
  TextSelection,
} from '@blocksuite/affine/block-std';
import type { AffineAIPanelWidget } from '@blocksuite/affine/blocks';
import { isInsideEdgelessEditor } from '@blocksuite/affine/blocks';
import { type BlockModel, Slice } from '@blocksuite/affine/store';

import {
  insertFromMarkdown,
  markDownToDoc,
  markdownToSnapshot,
} from '../../_common';

const getNoteId = (blockElement: BlockComponent) => {
  let element = blockElement;
  while (element.flavour !== 'affine:note') {
    if (!element.parentComponent) {
      break;
    }
    element = element.parentComponent;
  }

  return element.model.id;
};

const setBlockSelection = (
  host: EditorHost,
  parent: BlockComponent,
  models: BlockModel[]
) => {
  const selections = models
    .map(model => model.id)
    .map(blockId => host.selection.create('block', { blockId }));

  if (isInsideEdgelessEditor(host)) {
    const surfaceElementId = getNoteId(parent);
    const surfaceSelection = host.selection.create(
      'surface',
      selections[0].blockId,
      [surfaceElementId],
      true
    );

    selections.push(surfaceSelection);
    host.selection.set(selections);
  } else {
    host.selection.setGroup('note', selections);
  }
};

export const insert = async (
  host: EditorHost,
  content: string,
  selectBlock: BlockComponent,
  below: boolean = true
) => {
  const blockParent = selectBlock.parentComponent;
  if (!blockParent) return;
  const index = blockParent.model.children.findIndex(
    model => model.id === selectBlock.model.id
  );
  const insertIndex = below ? index + 1 : index;

  const { doc } = host;
  const models = await insertFromMarkdown(
    host,
    content,
    doc,
    blockParent.model.id,
    insertIndex
  );
  await host.updateComplete;
  requestAnimationFrame(() => setBlockSelection(host, blockParent, models));
};

export const insertBelow = async (
  host: EditorHost,
  content: string,
  selectBlock: BlockComponent
) => {
  await insert(host, content, selectBlock, true);
};

export const insertAbove = async (
  host: EditorHost,
  content: string,
  selectBlock: BlockComponent
) => {
  await insert(host, content, selectBlock, false);
};

export const replace = async (
  host: EditorHost,
  content: string,
  firstBlock: BlockComponent,
  selectedModels: BlockModel[],
  textSelection?: TextSelection
) => {
  const firstBlockParent = firstBlock.parentComponent;
  if (!firstBlockParent) return;
  const firstIndex = firstBlockParent.model.children.findIndex(
    model => model.id === firstBlock.model.id
  );

  if (textSelection) {
    const { snapshot, job } = await markdownToSnapshot(content, host);
    await job.snapshotToSlice(
      snapshot,
      host.doc,
      firstBlockParent.model.id,
      firstIndex + 1
    );
  } else {
    selectedModels.forEach(model => {
      host.doc.deleteBlock(model);
    });

    const { doc } = host;
    const models = await insertFromMarkdown(
      host,
      content,
      doc,
      firstBlockParent.model.id,
      firstIndex
    );

    await host.updateComplete;
    requestAnimationFrame(() =>
      setBlockSelection(host, firstBlockParent, models)
    );
  }
};

export const copyTextAnswer = async (panel: AffineAIPanelWidget) => {
  const host = panel.host;
  if (!panel.answer) {
    return false;
  }
  return copyText(host, panel.answer);
};

export const copyText = async (host: EditorHost, text: string) => {
  const previewDoc = await markDownToDoc(host, text);
  const models = previewDoc
    .getBlocksByFlavour('affine:note')
    .map(b => b.model)
    .flatMap(model => model.children);
  const slice = Slice.fromModels(previewDoc, models);
  await host.std.clipboard.copySlice(slice);
  return true;
};
