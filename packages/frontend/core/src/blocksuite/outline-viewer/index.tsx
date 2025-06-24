import { OutlineViewer } from '@blocksuite/affine/fragments/outline';
import type { EditorHost } from '@blocksuite/affine/std';
import { useCallback, useRef } from 'react';

import * as styles from './outline-viewer.css';

export const EditorOutlineViewer = ({
  editor,
  show,
  openOutlinePanel,
}: {
  editor: EditorHost | null;
  show: boolean;
  openOutlinePanel?: () => void;
}) => {
  const outlineViewerRef = useRef<OutlineViewer | null>(null);

  const onRefChange = useCallback(
    (container: HTMLDivElement | null) => {
      if (container && editor) {
        if (outlineViewerRef.current) {
          outlineViewerRef.current.remove();
        }
        outlineViewerRef.current = new OutlineViewer();
        outlineViewerRef.current.editor = editor;
        outlineViewerRef.current.toggleOutlinePanel = openOutlinePanel ?? null;
        container.append(outlineViewerRef.current);
      }
    },
    [editor, openOutlinePanel]
  );

  if (!editor || !show) return null;

  return <div className={styles.root} ref={onRefChange} />;
};
