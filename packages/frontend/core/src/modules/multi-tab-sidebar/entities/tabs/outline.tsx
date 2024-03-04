import { assertExists } from '@blocksuite/global/utils';
import { TocIcon } from '@blocksuite/icons';
import { OutlinePanel } from '@blocksuite/presets';
import { useCallback, useRef } from 'react';

import type { SidebarTab, SidebarTabProps } from '../sidebar-tab';
import * as styles from './outline.css';

// A wrapper for TOCNotesPanel
const EditorOutline = ({ editor }: SidebarTabProps) => {
  const outlinePanelRef = useRef<OutlinePanel | null>(null);

  const onRefChange = useCallback((container: HTMLDivElement | null) => {
    if (container) {
      assertExists(outlinePanelRef.current, 'toc panel should be initialized');
      container.append(outlinePanelRef.current);
    }
  }, []);

  if (!editor) {
    return;
  }

  if (!outlinePanelRef.current) {
    outlinePanelRef.current = new OutlinePanel();
  }

  if (editor !== outlinePanelRef.current?.editor) {
    (outlinePanelRef.current as OutlinePanel).editor = editor;
    (outlinePanelRef.current as OutlinePanel).fitPadding = [20, 20, 20, 20];
  }

  return <div className={styles.root} ref={onRefChange} />;
};

export const outlineTab: SidebarTab = {
  name: 'outline',
  icon: <TocIcon />,
  Component: EditorOutline,
};
