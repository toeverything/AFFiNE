import type {
  BlockSelection,
  EditorHost,
  TextSelection,
} from '@blocksuite/block-std';
import type {
  EdgelessRootBlockComponent,
  EdgelessRootService,
  ImageSelection,
  SerializedXYWH,
} from '@blocksuite/blocks';
import {
  BlocksUtils,
  Bound,
  getElementsBound,
  isInsideEdgelessEditor,
  NoteDisplayMode,
} from '@blocksuite/blocks';
import type { TemplateResult } from 'lit';

import {
  BlockIcon,
  CreateIcon,
  InsertBelowIcon,
  ReplaceIcon,
} from '../../_common/icons';
import { AIProvider } from '../../provider';
import { reportResponse } from '../../utils/action-reporter';
import { insertBelow, replace } from '../../utils/editor-actions';
import { insertFromMarkdown } from '../../utils/markdown-utils';
import type { ChatBlockMessage } from '../chat-context';

const { matchFlavours } = BlocksUtils;

type Selections = {
  text?: TextSelection;
  blocks?: BlockSelection[];
  images?: ImageSelection[];
};

type ChatAction = {
  icon: TemplateResult<1>;
  title: string;
  showWhen?: () => boolean;
  handler: (
    host: EditorHost,
    content: string,
    currentSelections: Selections,
    chatSessionId?: string,
    messageId?: string
  ) => Promise<void>;
};

const CommonActions: ChatAction[] = [
  {
    icon: ReplaceIcon,
    title: 'Replace selection',
    handler: async (
      host: EditorHost,
      content: string,
      currentSelections: Selections
    ) => {
      const currentTextSelection = currentSelections.text;
      const currentBlockSelections = currentSelections.blocks;
      const [_, data] = host.command
        .chain()
        .getSelectedBlocks({
          currentTextSelection,
          currentBlockSelections,
        })
        .run();
      if (!data.selectedBlocks) return;

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
          return;
        }
      }

      await replace(
        host,
        content,
        data.selectedBlocks[0],
        data.selectedBlocks.map(block => block.model),
        currentTextSelection
      );
    },
  },
  {
    icon: InsertBelowIcon,
    title: 'Insert below',
    handler: async (
      host: EditorHost,
      content: string,
      currentSelections: Selections
    ) => {
      const currentTextSelection = currentSelections.text;
      const currentBlockSelections = currentSelections.blocks;
      const currentImageSelections = currentSelections.images;
      const [_, data] = host.command
        .chain()
        .getSelectedBlocks({
          currentTextSelection,
          currentBlockSelections,
          currentImageSelections,
        })
        .run();
      if (!data.selectedBlocks) return;
      reportResponse('result:insert');
      await insertBelow(
        host,
        content,
        data.selectedBlocks[data.selectedBlocks?.length - 1]
      );
    },
  },
];

// Add AI chat block and focus on it
function addAIChatBlock(
  host: EditorHost,
  messages: ChatBlockMessage[],
  sessionId: string
) {
  if (!isInsideEdgelessEditor(host) || !host.doc.root?.id) return;

  const edgelessRootService = host.std.spec.getService(
    'affine:page'
  ) as EdgelessRootService;
  // Add AI chat block to the center of the viewport
  let { x, y } = edgelessRootService.viewport.center;
  const width = 300; // AI_CHAT_BLOCK_WIDTH = 300
  const height = 320; // AI_CHAT_BLOCK_HEIGHT = 320
  x = x - width / 2;
  y = y - height / 2;
  const bound = new Bound(x, y, width, height);
  const edgelessRootBlock = host.view.getBlock(
    host.doc.root?.id
  ) as EdgelessRootBlockComponent;
  const aiChatBlockId = edgelessRootService.addBlock(
    'affine:ai-chat',
    {
      xywh: bound.serialize(),
      messages: JSON.stringify(messages),
      sessionId,
    },
    edgelessRootBlock.surfaceBlockModel
  );

  // Focus on the AI chat block
  edgelessRootService.selection.set({
    elements: [aiChatBlockId],
    editing: false,
  });
}

const SAVE_CHAT_TO_BLOCK_ACTION: ChatAction = {
  icon: BlockIcon,
  title: 'Save chat to block',
  handler: async (
    host: EditorHost,
    _,
    __,
    chatSessionId?: string,
    messageId?: string
  ) => {
    // The chat session id and the latest message id are required to fork the chat session
    if (!chatSessionId || !messageId) {
      return;
    }

    const rootService = host.spec.getService('affine:page');
    const { docModeService } = rootService;
    const curMode = docModeService.getMode();
    if (curMode !== 'edgeless') {
      const { notificationService } = rootService;
      // set mode to edgeless
      docModeService.setMode('edgeless');
      // notify user to switch to edgeless mode
      if (notificationService) {
        notificationService.notify({
          title: 'Save chat to a block',
          message:
            'This feature is not available in the page editor. Switch to edgeless mode.',
          onClose: function (): void {},
        });
      }
    }

    // Fork copilot chat session
    const newSessionId = await AIProvider.forkChat?.({
      workspaceId: host.doc.collection.id,
      docId: host.doc.id,
      sessionId: chatSessionId,
      latestMessageId: messageId,
    });

    if (!newSessionId) {
      return;
    }

    // After switching to edgeless mode, the user can save the chat to a block
    addAIChatBlock(host, [], newSessionId);
  },
};

export const PageEditorActions = [
  ...CommonActions,
  {
    icon: CreateIcon,
    title: 'Create as a doc',
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
    },
  },
  SAVE_CHAT_TO_BLOCK_ACTION,
];

export const EdgelessEditorActions = [
  ...CommonActions,
  {
    icon: CreateIcon,
    title: 'Add to edgeless as note',
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
    },
  },
  SAVE_CHAT_TO_BLOCK_ACTION,
];
