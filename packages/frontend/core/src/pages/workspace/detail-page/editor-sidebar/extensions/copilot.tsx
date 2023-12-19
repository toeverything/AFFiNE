import { editorContainerAtom } from '@affine/component/block-suite-editor';
import { assertExists } from '@blocksuite/global/utils';
import { AiIcon } from '@blocksuite/icons';
import { CopilotPanel } from '@blocksuite/presets';
import { useAtom } from 'jotai';
import { useCallback, useRef } from 'react';

import type { EditorExtension } from '../types';
import * as styles from './outline.css';

// A wrapper for CopilotPanel
const EditorCopilotPanel = () => {
  const copilotPanelRef = useRef<CopilotPanel | null>(null);
  const [editorContainer] = useAtom(editorContainerAtom);

  const onRefChange = useCallback((container: HTMLDivElement | null) => {
    if (container) {
      assertExists(
        copilotPanelRef.current,
        'copilot panel should be initialized'
      );
      container.append(copilotPanelRef.current);
    }
  }, []);

  if (!editorContainer) {
    return;
  }

  if (!copilotPanelRef.current) {
    copilotPanelRef.current = new CopilotPanel();
  }

  if (editorContainer !== copilotPanelRef.current?.editor) {
    (copilotPanelRef.current as CopilotPanel).editor = editorContainer;
    // (copilotPanelRef.current as CopilotPanel).fitPadding = [20, 20, 20, 20];
  }

  return <div className={styles.root} ref={onRefChange} />;
};

export const copilotExtension: EditorExtension = {
  name: 'copilot',
  icon: <AiIcon />,
  Component: EditorCopilotPanel,
};
