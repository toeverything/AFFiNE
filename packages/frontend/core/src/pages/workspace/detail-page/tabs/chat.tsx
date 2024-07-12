import { ChatPanel } from '@affine/core/blocksuite/presets/ai';
import { assertExists } from '@blocksuite/global/utils';
import type { AffineEditorContainer } from '@blocksuite/presets';
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
    const pageService = editor.host.spec.getService('affine:page');

    const disposable = [
      pageService.slots.docLinkClicked.on(() => {
        (chatPanelRef.current as ChatPanel).doc = editor.doc;
      }),
      pageService.docModeService.onModeChange(() => {
        if (!editor.host) return;
        (chatPanelRef.current as ChatPanel).host = editor.host;
      }),
    ];

    return () => disposable.forEach(d => d.dispose());
  }, [editor]);

  if (!editor) {
    return;
  }

  if (!chatPanelRef.current) {
    chatPanelRef.current = new ChatPanel();
  }

  (chatPanelRef.current as ChatPanel).host = editor.host;
  (chatPanelRef.current as ChatPanel).doc = editor.doc;
  // (copilotPanelRef.current as CopilotPanel).fitPadding = [20, 20, 20, 20];

  return <div className={styles.root} ref={onRefChange} />;
});
