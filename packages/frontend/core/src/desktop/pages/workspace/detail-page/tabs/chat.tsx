import { ChatPanel } from '@affine/core/blocksuite/presets/ai';
import {
  DocModeProvider,
  RefNodeSlotsProvider,
} from '@blocksuite/affine/blocks';
import { assertExists } from '@blocksuite/affine/global/utils';
import type { AffineEditorContainer } from '@blocksuite/affine/presets';
import { forwardRef, useCallback, useEffect, useRef } from 'react';

import * as styles from './chat.css';

export interface SidebarTabProps {
  editor: AffineEditorContainer | null;
  onLoad?: ((component: HTMLElement) => void) | null;
}

// A wrapper for CopilotPanel
export const EditorChatPanel = forwardRef(function EditorChatPanel(
  { editor, onLoad }: SidebarTabProps,
  ref: React.ForwardedRef<ChatPanel>
) {
  const chatPanelRef = useRef<ChatPanel | null>(null);

  const onRefChange = useCallback((container: HTMLDivElement | null) => {
    if (container) {
      assertExists(chatPanelRef.current, 'chat panel should be initialized');
      container.append(chatPanelRef.current);
    }
  }, []);

  useEffect(() => {
    if (onLoad && chatPanelRef.current) {
      (chatPanelRef.current as ChatPanel).updateComplete
        .then(() => {
          if (ref) {
            if (typeof ref === 'function') {
              ref(chatPanelRef.current);
            } else {
              ref.current = chatPanelRef.current;
            }
          }
        })
        .catch(console.error);
    }
  }, [onLoad, ref]);

  useEffect(() => {
    if (!editor) return;
    const pageService = editor.host?.std.getService('affine:page');
    if (!pageService) return;
    const docModeService = editor.host?.std.get(DocModeProvider);
    const refNodeService = editor.host?.std.getOptional(RefNodeSlotsProvider);

    const disposable = [
      refNodeService &&
        refNodeService.docLinkClicked.on(() => {
          (chatPanelRef.current as ChatPanel).doc = editor.doc;
        }),
      docModeService &&
        docModeService.onPrimaryModeChange(() => {
          if (!editor.host) return;
          (chatPanelRef.current as ChatPanel).host = editor.host;
        }, editor.doc.id),
    ];

    return () => disposable.forEach(d => d?.dispose());
  }, [editor]);

  if (!editor) {
    return;
  }

  if (!chatPanelRef.current) {
    chatPanelRef.current = new ChatPanel();
  }

  if (editor.host) {
    (chatPanelRef.current as ChatPanel).host = editor.host;
  }
  (chatPanelRef.current as ChatPanel).doc = editor.doc;
  // (copilotPanelRef.current as CopilotPanel).fitPadding = [20, 20, 20, 20];

  return <div className={styles.root} ref={onRefChange} />;
});
