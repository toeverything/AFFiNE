import {
  CalloutBlockModel,
  ParagraphBlockModel,
} from '@blocksuite/affine-model';
import { focusTextModel } from '@blocksuite/affine-rich-text';
import { matchModels } from '@blocksuite/affine-shared/utils';
import type { Command, EditorHost } from '@blocksuite/std';

export const splitCalloutCommand: Command<{
  blockId: string;
  inlineIndex: number;
  currentBlockId: string;
}> = (ctx, next) => {
  const { blockId, inlineIndex, currentBlockId, std } = ctx;
  const host = std.host as EditorHost;
  const doc = host.store;

  const calloutModel = doc.getBlock(blockId)?.model;
  if (!calloutModel || !matchModels(calloutModel, [CalloutBlockModel])) {
    console.error(`block ${blockId} is not a callout block`);
    return;
  }

  const currentModel = doc.getBlock(currentBlockId)?.model;
  if (!currentModel) {
    console.error(`current block ${currentBlockId} not found`);
    return;
  }

  doc.captureSync();

  if (matchModels(currentModel, [ParagraphBlockModel])) {
    // User is in a paragraph within the callout's children
    const afterText = currentModel.props.text.split(inlineIndex);

    // Update the current paragraph's text to keep only the part before cursor
    doc.transact(() => {
      currentModel.props.text.delete(
        inlineIndex,
        currentModel.props.text.length - inlineIndex
      );
    });

    // Create a new paragraph block after the current one
    const parent = doc.getParent(currentModel);
    if (parent) {
      const currentIndex = parent.children.indexOf(currentModel);
      const newParagraphId = doc.addBlock(
        'affine:paragraph',
        {
          text: afterText,
        },
        parent,
        currentIndex + 1
      );

      if (newParagraphId) {
        host.updateComplete
          .then(() => {
            focusTextModel(std, newParagraphId);
          })
          .catch(console.error);
      }
    }
  } else {
    // If current block is not a paragraph, create a new paragraph in callout
    const newParagraphId = doc.addBlock(
      'affine:paragraph',
      {
        text: new Text(),
      },
      calloutModel
    );

    if (newParagraphId) {
      host.updateComplete
        .then(() => {
          focusTextModel(std, newParagraphId);
        })
        .catch(console.error);
    }
  }

  next();
};
