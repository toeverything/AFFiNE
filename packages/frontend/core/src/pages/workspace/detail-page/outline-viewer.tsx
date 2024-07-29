import type { AffineEditorContainer } from '@blocksuite/presets';
import { OutlineViewer } from '@blocksuite/presets';
import { useCallback, useRef } from 'react';

import * as styles from './outline-viewer.css';

export const EditorOutlineViewer = ({
  editor,
  toggleOutlinePanel,
}: {
  editor: AffineEditorContainer | null;
  toggleOutlinePanel: () => void;
}) => {
  const outlineViewerRef = useRef<OutlineViewer | null>(null);

  const onRefChange = useCallback((container: HTMLDivElement | null) => {
    if (container) {
      if (outlineViewerRef.current === null) {
        console.error('outline viewer should be initialized');
        return;
      }

      container.append(outlineViewerRef.current);
    }
  }, []);

  if (!editor) {
    return;
  }

  if (!outlineViewerRef.current) {
    outlineViewerRef.current = new OutlineViewer();
    (outlineViewerRef.current as OutlineViewer).editor = editor;
    (outlineViewerRef.current as OutlineViewer).toggleOutlinePanel =
      toggleOutlinePanel;
  }

  return <div className={styles.root} ref={onRefChange} />;
};
