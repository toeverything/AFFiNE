import { assertExists } from '@blocksuite/global/utils';
import { FrameIcon } from '@blocksuite/icons';
import { FramePanel } from '@blocksuite/presets';
import { useCallback, useRef } from 'react';

import type { SidebarTab, SidebarTabProps } from '../sidebar-tab';
import * as styles from './frame.css';

// A wrapper for FramePanel
const EditorFramePanel = ({ editor }: SidebarTabProps) => {
  const framePanelRef = useRef<FramePanel | null>(null);

  const onRefChange = useCallback((container: HTMLDivElement | null) => {
    if (container) {
      assertExists(framePanelRef.current, 'frame panel should be initialized');
      container.append(framePanelRef.current);
    }
  }, []);

  if (!editor) {
    return;
  }

  if (!framePanelRef.current) {
    framePanelRef.current = new FramePanel();
  }

  if (editor !== framePanelRef.current?.editor) {
    (framePanelRef.current as FramePanel).editor = editor;
    (framePanelRef.current as FramePanel).fitPadding = [20, 20, 20, 20];
  }

  return <div className={styles.root} ref={onRefChange} />;
};

export const framePanelTab: SidebarTab = {
  name: 'frame',
  icon: <FrameIcon />,
  Component: EditorFramePanel,
};
