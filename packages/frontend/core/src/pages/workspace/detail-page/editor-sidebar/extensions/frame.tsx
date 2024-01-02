import { assertExists } from '@blocksuite/global/utils';
import { FrameIcon } from '@blocksuite/icons';
import { FramePanel } from '@blocksuite/presets';
import { useActiveBlocksuiteEditor } from '@toeverything/hooks/use-block-suite-editor';
import { useCallback, useRef } from 'react';

import type { EditorExtension } from '../types';
import * as styles from './frame.css';

// A wrapper for FramePanel
const EditorFramePanel = () => {
  const framePanelRef = useRef<FramePanel | null>(null);

  const [editor] = useActiveBlocksuiteEditor();

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

export const framePanelExtension: EditorExtension = {
  name: 'frame',
  icon: <FrameIcon />,
  Component: EditorFramePanel,
};
