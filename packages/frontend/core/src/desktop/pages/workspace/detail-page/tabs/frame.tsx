import { assertExists } from '@blocksuite/affine/global/utils';
import type { AffineEditorContainer } from '@blocksuite/affine/presets';
import { FramePanel } from '@blocksuite/affine/presets';
import { useCallback, useRef } from 'react';

import * as styles from './frame.css';

// A wrapper for FramePanel
export const EditorFramePanel = ({
  editor,
}: {
  editor: AffineEditorContainer | null;
}) => {
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

  if (editor.host !== framePanelRef.current?.host && editor.host) {
    (framePanelRef.current as FramePanel).host = editor.host;
    (framePanelRef.current as FramePanel).fitPadding = [20, 20, 20, 20];
  }

  return <div className={styles.root} ref={onRefChange} />;
};
