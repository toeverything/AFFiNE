import { FramePanel } from '@blocksuite/affine/fragments/frame-panel';
import type { EditorHost } from '@blocksuite/affine/std';
import { useCallback, useEffect, useRef } from 'react';

import * as styles from './frame.css';

// A wrapper for FramePanel
export const EditorFramePanel = ({ editor }: { editor: EditorHost | null }) => {
  const framePanelRef = useRef<FramePanel | null>(null);

  const onRefChange = useCallback(
    (container: HTMLDivElement | null) => {
      if (editor && container && container.children.length === 0) {
        framePanelRef.current = new FramePanel();
        framePanelRef.current.host = editor;
        framePanelRef.current.fitPadding = [20, 20, 20, 20];
        container.append(framePanelRef.current);
      }
    },
    [editor]
  );

  useEffect(() => {
    if (editor && framePanelRef.current) {
      framePanelRef.current.host = editor;
    }
  }, [editor]);

  return <div className={styles.root} ref={onRefChange} />;
};
