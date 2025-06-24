import {
  AttachmentBlockModel,
  BookmarkBlockModel,
  CalloutBlockModel,
  CodeBlockModel,
  DatabaseBlockModel,
  DividerBlockModel,
  EdgelessTextBlockModel,
  ImageBlockModel,
  ListBlockModel,
  NoteBlockModel,
  ParagraphBlockModel,
  type RootBlockModel,
} from '@blocksuite/affine-model';
import {
  asyncSetInlineRange,
  focusTextModel,
} from '@blocksuite/affine-rich-text';
import { EMBED_BLOCK_MODEL_LIST } from '@blocksuite/affine-shared/consts';
import type { ExtendedModel } from '@blocksuite/affine-shared/types';
import {
  focusTitle,
  getDocTitleInlineEditor,
  getPrevContentBlock,
  matchModels,
} from '@blocksuite/affine-shared/utils';
import { BlockSelection, type EditorHost } from '@blocksuite/std';
import type { BlockModel, Text } from '@blocksuite/store';

/**
 * Merge the paragraph with prev block
 *
 * Before press backspace
 * - line1
 *   - line2
 *   - |aaa
 *   - line3
 *
 * After press backspace
 * - line1
 *   - line2|aaa
 *   - line3
 */
export function mergeWithPrev(editorHost: EditorHost, model: BlockModel) {
  const doc = model.store;
  const parent = doc.getParent(model);
  if (!parent) return false;

  const prevBlock = getPrevContentBlock(editorHost, model);
  if (!prevBlock) {
    return handleNoPreviousSibling(editorHost, model);
  }

  const modelIndex = parent.children.indexOf(model);
  const prevSibling = doc.getPrev(model);
  if (matchModels(prevSibling, [CalloutBlockModel])) {
    editorHost.selection.setGroup('note', [
      editorHost.selection.create(BlockSelection, {
        blockId: prevSibling.id,
      }),
    ]);
    return true;
  }

  if (matchModels(prevBlock, [ParagraphBlockModel, ListBlockModel])) {
    if (
      (modelIndex === -1 || modelIndex === parent.children.length - 1) &&
      parent.role === 'content'
    )
      return false;

    const lengthBeforeJoin = prevBlock.props.text?.length ?? 0;
    prevBlock.props.text.join(model.text as Text);
    doc.deleteBlock(model, {
      bringChildrenTo: parent,
    });
    asyncSetInlineRange(editorHost.std, prevBlock, {
      index: lengthBeforeJoin,
      length: 0,
    }).catch(console.error);
    return true;
  }

  if (
    matchModels(prevBlock, [
      AttachmentBlockModel,
      BookmarkBlockModel,
      CodeBlockModel,
      ImageBlockModel,
      DividerBlockModel,
      ...EMBED_BLOCK_MODEL_LIST,
    ])
  ) {
    const selection = editorHost.selection.create(BlockSelection, {
      blockId: prevBlock.id,
    });
    editorHost.selection.setGroup('note', [selection]);

    if (model.text?.length === 0) {
      doc.deleteBlock(model, {
        bringChildrenTo: parent,
      });
    }

    return true;
  }

  if (matchModels(parent, [DatabaseBlockModel])) {
    doc.deleteBlock(model);
    focusTextModel(editorHost.std, prevBlock.id, prevBlock.text?.yText.length);
    return true;
  }

  return false;
}

function handleNoPreviousSibling(editorHost: EditorHost, model: ExtendedModel) {
  const doc = model.store;
  const text = model.text;
  const parent = doc.getParent(model);
  if (!parent) return false;

  const focusFirstBlockStart = () => {
    const firstBlock = parent.firstChild();
    if (firstBlock) {
      focusTextModel(editorHost.std, firstBlock.id, 0);
    }
  };

  if (matchModels(parent, [NoteBlockModel])) {
    const hasTitleEditor = getDocTitleInlineEditor(editorHost);
    const rootModel = model.store.root as RootBlockModel;
    const title = rootModel.props.title;

    const shouldHandleTitle = parent.isPageBlock() && hasTitleEditor;

    doc.captureSync();

    if (shouldHandleTitle) {
      let textLength = 0;
      if (text) {
        textLength = text.length;
        title.join(text);
      }
      if (model.children.length > 0 || doc.getNext(model)) {
        doc.deleteBlock(model, {
          bringChildrenTo: parent,
        });
      }
      // no other blocks, preserve a empty line
      else {
        text?.clear();
      }
      focusTitle(editorHost, title.length - textLength);
      return true;
    }

    // Preserve at least one block to be able to focus on container click
    if (
      text?.length === 0 &&
      (model.children.length > 0 || doc.getNext(model))
    ) {
      doc.deleteBlock(model, {
        bringChildrenTo: parent,
      });
      focusFirstBlockStart();
      return true;
    }
  }

  if (
    matchModels(parent, [EdgelessTextBlockModel]) &&
    text?.length === 0 &&
    (model.children.length > 0 || doc.getNext(model))
  ) {
    doc.deleteBlock(model, {
      bringChildrenTo: parent,
    });
    focusFirstBlockStart();
    return true;
  }

  return false;
}
