import { assertExists } from '@blocksuite/global/utils';
import { AiIcon } from '@blocksuite/icons';
import { CopilotPanel } from '@blocksuite/presets';
import { useCallback, useRef } from 'react';

import type { SidebarTab, SidebarTabProps } from '../sidebar-tab';
import * as styles from './outline.css';

// A wrapper for CopilotPanel
const EditorCopilotPanel = ({ editor }: SidebarTabProps) => {
  const copilotPanelRef = useRef<CopilotPanel | null>(null);

  const onRefChange = useCallback((container: HTMLDivElement | null) => {
    if (container) {
      assertExists(
        copilotPanelRef.current,
        'copilot panel should be initialized'
      );
      container.append(copilotPanelRef.current);
    }
  }, []);

  if (!editor) {
    return;
  }

  if (!copilotPanelRef.current) {
    copilotPanelRef.current = new CopilotPanel();
  }

  if (editor !== copilotPanelRef.current?.editor) {
    (copilotPanelRef.current as CopilotPanel).editor = editor;
    // (copilotPanelRef.current as CopilotPanel).fitPadding = [20, 20, 20, 20];
  }

  return <div className={styles.root} ref={onRefChange} />;
};

export const copilotTab: SidebarTab = {
  name: 'copilot',
  icon: <AiIcon />,
  Component: EditorCopilotPanel,
};
