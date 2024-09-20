import type { AffineEditorContainer } from '@blocksuite/affine/presets';
import { OutlinePanel } from '@blocksuite/affine/presets';
import { useCallback, useRef } from 'react';

import * as styles from './outline.css';

// A wrapper for TOCNotesPanel
export const EditorOutlinePanel = ({
  editor,
}: {
  editor: AffineEditorContainer | null;
}) => {
  const outlinePanelRef = useRef<OutlinePanel | null>(null);

  const onRefChange = useCallback((container: HTMLDivElement | null) => {
    if (container) {
      if (outlinePanelRef.current === null) {
        console.error('outline panel should be initialized');
        return;
      }
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
