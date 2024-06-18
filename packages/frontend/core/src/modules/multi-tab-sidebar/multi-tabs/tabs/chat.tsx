import { ChatPanel } from '@affine/core/blocksuite/presets/ai';
import { assertExists } from '@blocksuite/global/utils';
import { AiIcon } from '@blocksuite/icons/rc';
import { useCallback, useEffect, useRef } from 'react';

import type { SidebarTab, SidebarTabProps } from '../sidebar-tab';
import * as styles from './chat.css';

// A wrapper for CopilotPanel
const EditorChatPanel = ({ editor }: SidebarTabProps) => {
  const chatPanelRef = useRef<ChatPanel | null>(null);

  const onRefChange = useCallback((container: HTMLDivElement | null) => {
    if (container) {
      assertExists(chatPanelRef.current, 'chat panel should be initialized');
      container.append(chatPanelRef.current);
    }
  }, []);

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
};

export const chatTab: SidebarTab = {
  name: 'chat',
  icon: <AiIcon />,
  Component: EditorChatPanel,
};
