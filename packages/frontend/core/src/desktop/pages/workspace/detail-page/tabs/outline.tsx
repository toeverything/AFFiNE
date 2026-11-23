import { OutlinePanel } from '@blocksuite/affine/fragments/outline';
import type { EditorHost } from '@blocksuite/affine/std';
import { useCallback, useEffect, useRef } from 'react';

import * as styles from './outline.css';

// A wrapper for TOCNotesPanel
export const EditorOutlinePanel = ({
  editor,
}: {
  editor: EditorHost | null;
}) => {
  const outlinePanelRef = useRef<OutlinePanel | null>(null);

  const onRefChange = useCallback(
    (container: HTMLDivElement | null) => {
      if (container && editor && container.children.length === 0) {
        outlinePanelRef.current = new OutlinePanel();
        outlinePanelRef.current.editor = editor;
        outlinePanelRef.current.fitPadding = [20, 20, 20, 20];
        container.append(outlinePanelRef.current);
      }
    },
    [editor]
  );

  useEffect(() => {
    if (editor && outlinePanelRef.current) {
      outlinePanelRef.current.editor = editor;
    }
  }, [editor]);

  return <div className={styles.root} ref={onRefChange} />;
};
