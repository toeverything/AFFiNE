import { assertExists } from '@blocksuite/global/utils';
import { AiIcon } from '@blocksuite/icons';
import { ChatPanel } from '@blocksuite/presets';
import { useCallback, useRef } from 'react';

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

  if (!editor) {
    return;
  }

  if (!chatPanelRef.current) {
    chatPanelRef.current = new ChatPanel();
  }

  if (editor !== chatPanelRef.current?.editor) {
    (chatPanelRef.current as ChatPanel).editor = editor;
    // (copilotPanelRef.current as CopilotPanel).fitPadding = [20, 20, 20, 20];
  }

  return <div className={styles.root} ref={onRefChange} />;
};

export const chatTab: SidebarTab = {
  name: 'chat',
  icon: <AiIcon />,
  Component: EditorChatPanel,
};
