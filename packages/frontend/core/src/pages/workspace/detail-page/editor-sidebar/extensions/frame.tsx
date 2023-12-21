import { editorContainerAtom } from '@affine/component/block-suite-editor';
import { assertExists } from '@blocksuite/global/utils';
import { FrameIcon } from '@blocksuite/icons';
import { FramePanel } from '@blocksuite/presets';
import { useAtom } from 'jotai';
import { useCallback, useRef } from 'react';

import type { EditorExtension } from '../types';
import * as styles from './frame.css';

// A wrapper for FramePanel
const EditorFramePanel = () => {
  const framePanelRef = useRef<FramePanel | null>(null);
  const [editorContainer] = useAtom(editorContainerAtom);

  const onRefChange = useCallback((container: HTMLDivElement | null) => {
    if (container) {
      assertExists(framePanelRef.current, 'frame panel should be initialized');
      container.append(framePanelRef.current);
    }
  }, []);

  if (!editorContainer) {
    return;
  }

  if (!framePanelRef.current) {
    framePanelRef.current = new FramePanel();
  }

  if (editorContainer !== framePanelRef.current?.editor) {
    (framePanelRef.current as FramePanel).editor = editorContainer;
    (framePanelRef.current as FramePanel).fitPadding = [20, 20, 20, 20];
  }

  return <div className={styles.root} ref={onRefChange} />;
};

export const framePanelExtension: EditorExtension = {
  name: 'frame',
  icon: <FrameIcon />,
  Component: EditorFramePanel,
};
