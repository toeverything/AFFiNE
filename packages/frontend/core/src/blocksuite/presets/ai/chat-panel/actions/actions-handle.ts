import type {
  BlockSelection,
  EditorHost,
  TextSelection,
} from '@blocksuite/block-std';
import type {
  EdgelessRootService,
  ImageSelection,
  SerializedXYWH,
} from '@blocksuite/blocks';
import {
  BlocksUtils,
  Bound,
  getElementsBound,
  NoteDisplayMode,
} from '@blocksuite/blocks';

import { CreateIcon, InsertBelowIcon, ReplaceIcon } from '../../_common/icons';
import { reportResponse } from '../../utils/action-reporter';
import { insertBelow, replace } from '../../utils/editor-actions';
import { insertFromMarkdown } from '../../utils/markdown-utils';

const { matchFlavours } = BlocksUtils;

const CommonActions = [
  {
    icon: ReplaceIcon,
    title: 'Replace selection',
    toast: 'Successfully replaced',
    handler: async (
      host: EditorHost,
      content: string,
      currentTextSelection?: TextSelection,
      currentBlockSelections?: BlockSelection[]
    ) => {
      const [_, data] = host.command
        .chain()
        .getSelectedBlocks({
          currentTextSelection,
          currentBlockSelections,
        })
        .run();
      if (!data.selectedBlocks) return false;

      reportResponse('result:replace');

      if (currentTextSelection) {
        const { doc } = host;
        const block = doc.getBlock(currentTextSelection.blockId);
        if (matchFlavours(block?.model ?? null, ['affine:paragraph'])) {
          block?.model.text?.replace(
            currentTextSelection.from.index,
            currentTextSelection.from.length,
            content
          );
          return true;
        }
      }

      await replace(
        host,
        content,
        data.selectedBlocks[0],
        data.selectedBlocks.map(block => block.model),
        currentTextSelection
      );
      return true;
    },
  },
  {
    icon: InsertBelowIcon,
    title: 'Insert below',
    toast: 'Successfully inserted',
    handler: async (
      host: EditorHost,
      content: string,
      currentTextSelection?: TextSelection,
      currentBlockSelections?: BlockSelection[],
      currentImageSelections?: ImageSelection[]
    ) => {
      const [_, data] = host.command
        .chain()
        .getSelectedBlocks({
          currentTextSelection,
          currentBlockSelections,
          currentImageSelections,
        })
        .run();
      if (!data.selectedBlocks) return false;
      reportResponse('result:insert');
      await insertBelow(
        host,
        content,
        data.selectedBlocks[data.selectedBlocks?.length - 1]
      );
      return true;
    },
  },
];

export const PageEditorActions = [
  ...CommonActions,
  {
    icon: CreateIcon,
    title: 'Create as a doc',
    toast: 'New doc created',
    handler: (host: EditorHost, content: string) => {
      reportResponse('result:add-page');
      const newDoc = host.doc.collection.createDoc();
      newDoc.load();
      const rootId = newDoc.addBlock('affine:page');
      newDoc.addBlock('affine:surface', {}, rootId);
      const noteId = newDoc.addBlock('affine:note', {}, rootId);

      host.spec.getService('affine:page').slots.docLinkClicked.emit({
        docId: newDoc.id,
      });
      let complete = false;
      (function addContent() {
        if (complete) return;
        const newHost = document.querySelector('editor-host');
        // FIXME: this is a hack to wait for the host to be ready, now we don't have a way to know if the new host is ready
        if (!newHost || newHost === host) {
          setTimeout(addContent, 100);
          return;
        }
        complete = true;
        insertFromMarkdown(newHost, content, noteId, 0).catch(console.error);
      })();

      return true;
    },
  },
];

export const EdgelessEditorActions = [
  ...CommonActions,
  {
    icon: CreateIcon,
    title: 'Add to edgeless as note',
    toast: 'New note created',
    handler: async (host: EditorHost, content: string) => {
      reportResponse('result:add-note');
      const { doc } = host;
      const service = host.spec.getService<EdgelessRootService>('affine:page');
      const elements = service.selection.selectedElements;

      const props: { displayMode: NoteDisplayMode; xywh?: SerializedXYWH } = {
        displayMode: NoteDisplayMode.EdgelessOnly,
      };

      if (elements.length > 0) {
        const bound = getElementsBound(
          elements.map(e => Bound.deserialize(e.xywh))
        );
        const newBound = new Bound(bound.x, bound.maxY + 10, bound.w);
        props.xywh = newBound.serialize();
      }

      const id = doc.addBlock('affine:note', props, doc.root?.id);

      await insertFromMarkdown(host, content, id, 0);

      service.selection.set({
        elements: [id],
        editing: false,
      });

      return true;
    },
  },
];
