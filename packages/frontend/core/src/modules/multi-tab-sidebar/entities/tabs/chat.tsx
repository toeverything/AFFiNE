import { useWorkspaceEnabledFeatures } from '@affine/core/hooks/use-workspace-features';
import { FeatureType } from '@affine/graphql';
import { assertExists } from '@blocksuite/global/utils';
import { AiIcon } from '@blocksuite/icons';
import { ChatPanel } from '@blocksuite/presets';
import { useService, Workspace } from '@toeverything/infra';
import { useCallback, useRef } from 'react';

import type { SidebarTab, SidebarTabProps } from '../sidebar-tab';
import * as styles from './chat.css';

// A wrapper for CopilotPanel
const EditorChatPanel = ({ editor }: SidebarTabProps) => {
  const workspace = useService(Workspace);
  const copilotEnabled = useWorkspaceEnabledFeatures(workspace.meta).includes(
    FeatureType.Copilot
  );
  const chatPanelRef = useRef<ChatPanel | null>(null);

  const onRefChange = useCallback(
    (container: HTMLDivElement | null) => {
      if (container && copilotEnabled) {
        assertExists(chatPanelRef.current, 'chat panel should be initialized');
        container.append(chatPanelRef.current);
      }
    },
    [copilotEnabled]
  );

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
