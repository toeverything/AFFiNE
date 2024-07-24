import { ChatHistoryOrder } from '@affine/graphql';
import type {
  BlockSelection,
  EditorHost,
  TextSelection,
} from '@blocksuite/block-std';
import type {
  DocMode,
  EdgelessRootService,
  ImageSelection,
  PageRootService,
} from '@blocksuite/blocks';
import {
  BlocksUtils,
  getElementsBound,
  NoteDisplayMode,
} from '@blocksuite/blocks';
import type { SerializedXYWH } from '@blocksuite/global/utils';
import { Bound } from '@blocksuite/global/utils';
import type { Doc } from '@blocksuite/store';
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
import type { ChatBlockMessage, ChatContextValue } from '../chat-context';

const { matchFlavours } = BlocksUtils;

type Selections = {
  text?: TextSelection;
  blocks?: BlockSelection[];
  images?: ImageSelection[];
};

type ChatAction = {
  icon: TemplateResult<1>;
  title: string;
  toast: string;
  showWhen: (host: EditorHost) => boolean;
  handler: (
    host: EditorHost,
    content: string,
    currentSelections: Selections,
    chatContext?: ChatContextValue,
    messageId?: string
  ) => Promise<boolean>;
};

async function constructChatBlockMessages(doc: Doc, forkSessionId: string) {
  const userInfo = await AIProvider.userInfo;
  // Get fork session messages
  const histories = await AIProvider.histories?.chats(
    doc.collection.id,
    doc.id,
    {
      sessionId: forkSessionId,
      messageOrder: ChatHistoryOrder.asc,
    }
  );

  if (!histories || !histories.length) {
    return [];
  }

  const messages = histories[0].messages.map(message => {
    const { role, id, content, createdAt } = message;
    const isUser = role === 'user';
    const userInfoProps = isUser
      ? {
          userId: userInfo?.id,
          userName: userInfo?.name,
          avatarUrl: userInfo?.avatarUrl ?? undefined,
        }
      : {};
    return {
      id,
      role,
      content,
      createdAt,
      attachments: [],
      ...userInfoProps,
    };
  });
  return messages;
}

function getViewportCenter(
  mode: DocMode,
  rootService: PageRootService | EdgelessRootService
) {
  const center = { x: 0, y: 0 };
  if (mode === 'page') {
    const viewport = rootService.editPropsStore.getStorage('viewport');
    if (viewport) {
      if ('xywh' in viewport) {
        const bound = Bound.deserialize(viewport.xywh);
        center.x = bound.x + bound.w / 2;
        center.y = bound.y + bound.h / 2;
      } else {
        center.x = viewport.centerX;
        center.y = viewport.centerY;
      }
    }
  } else {
    // Else we should get latest viewport center from the edgeless root service
    const edgelessService = rootService as EdgelessRootService;
    center.x = edgelessService.viewport.centerX;
    center.y = edgelessService.viewport.centerY;
  }

  return center;
}

// Add AI chat block and focus on it
function addAIChatBlock(
  doc: Doc,
  messages: ChatBlockMessage[],
  sessionId: string,
  viewportCenter: { x: number; y: number }
) {
  if (!messages.length || !sessionId) {
    return;
  }

  const surfaceBlock = doc
    .getBlocks()
    .find(block => block.flavour === 'affine:surface');
  if (!surfaceBlock) {
    return;
  }

  // Add AI chat block to the center of the viewport
  const width = 300; // AI_CHAT_BLOCK_WIDTH = 300
  const height = 320; // AI_CHAT_BLOCK_HEIGHT = 320
  const x = viewportCenter.x - width / 2;
  const y = viewportCenter.y - height / 2;
  const bound = new Bound(x, y, width, height);
  const aiChatBlockId = doc.addBlock(
    'affine:embed-ai-chat' as keyof BlockSuite.BlockModels,
    {
      xywh: bound.serialize(),
      messages: JSON.stringify(messages),
      sessionId,
    },
    surfaceBlock.id
  );

  return aiChatBlockId;
}

const CommonActions: ChatAction[] = [
  {
    icon: ReplaceIcon,
    title: 'Replace selection',
    showWhen: () => true,
    toast: 'Successfully replaced',
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
    showWhen: () => true,
    toast: 'Successfully inserted',
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

const SAVE_CHAT_TO_BLOCK_ACTION: ChatAction = {
  icon: BlockIcon,
  title: 'Save chat to block',
  toast: 'Successfully saved chat to a block',
  showWhen: (host: EditorHost) =>
    !!host.doc.awarenessStore.getFlag('enable_ai_chat_block'),
  handler: async (
    host: EditorHost,
    _,
    __,
    chatContext?: ChatContextValue,
    messageId?: string
  ) => {
    // The chat session id and the latest message id are required to fork the chat session
    const parentSessionId = chatContext?.chatSessionId;
    if (!messageId || !parentSessionId) {
      return false;
    }

    const rootService = host.spec.getService('affine:page');
    if (!rootService) return false;

    const { docModeService, notificationService } = rootService;
    const curMode = docModeService.getMode();
    const viewportCenter = getViewportCenter(curMode, rootService);
    // If current mode is not edgeless, switch to edgeless mode first
    if (curMode !== 'edgeless') {
      // Set mode to edgeless
      docModeService.setMode('edgeless');
      // Notify user to switch to edgeless mode
      notificationService?.notify({
        title: 'Save chat to a block',
        accent: 'info',
        message:
          'This feature is not available in the page editor. Switch to edgeless mode.',
        onClose: function (): void {},
      });
    }

    try {
      const newSessionId = await AIProvider.forkChat?.({
        workspaceId: host.doc.collection.id,
        docId: host.doc.id,
        sessionId: parentSessionId,
        latestMessageId: messageId,
      });

      if (!newSessionId) {
        return false;
      }

      // Construct chat block messages from the forked chat session
      const messages = await constructChatBlockMessages(host.doc, newSessionId);

      // After switching to edgeless mode, the user can save the chat to a block
      const blockId = addAIChatBlock(
        host.doc,
        messages,
        newSessionId,
        viewportCenter
      );
      if (!blockId) {
        return false;
      }

      return true;
    } catch (err) {
      console.error(err);
      notificationService?.notify({
        title: 'Failed to save chat to a block',
        accent: 'error',
        onClose: function (): void {},
      });
      return false;
    }
  },
};

export const PageEditorActions = [
  ...CommonActions,
  {
    icon: CreateIcon,
    title: 'Create as a doc',
    showWhen: () => true,
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
  SAVE_CHAT_TO_BLOCK_ACTION,
];

export const EdgelessEditorActions = [
  ...CommonActions,
  {
    icon: CreateIcon,
    title: 'Add to edgeless as note',
    showWhen: () => true,
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
  SAVE_CHAT_TO_BLOCK_ACTION,
];
