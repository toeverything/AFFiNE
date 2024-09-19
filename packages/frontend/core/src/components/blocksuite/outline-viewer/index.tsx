import type { AffineEditorContainer } from '@blocksuite/affine/presets';
import { OutlineViewer } from '@blocksuite/affine/presets';
import { useCallback, useRef } from 'react';

import * as styles from './outline-viewer.css';

export const EditorOutlineViewer = ({
  editor,
  show,
  openOutlinePanel,
}: {
  editor: AffineEditorContainer | null;
  show: boolean;
  openOutlinePanel?: () => void;
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

  if (!editor || !show) return;

  if (!outlineViewerRef.current) {
    outlineViewerRef.current = new OutlineViewer();
  }
  if (outlineViewerRef.current.editor !== editor) {
    outlineViewerRef.current.editor = editor;
  }
  if (
    outlineViewerRef.current.toggleOutlinePanel !== openOutlinePanel &&
    openOutlinePanel
  ) {
    outlineViewerRef.current.toggleOutlinePanel = openOutlinePanel;
  }

  return <div className={styles.root} ref={onRefChange} />;
};
