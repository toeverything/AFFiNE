import { assertExists } from '@blocksuite/global/utils';
import { AiIcon } from '@blocksuite/icons';
import { CopilotPanel } from '@blocksuite/presets';
import { useActiveBlocksuiteEditor } from '@toeverything/hooks/use-block-suite-editor';
import { useCallback, useRef } from 'react';

import type { EditorExtension } from '../types';
import * as styles from './outline.css';

// A wrapper for CopilotPanel
const EditorCopilotPanel = () => {
  const copilotPanelRef = useRef<CopilotPanel | null>(null);
  const [editor] = useActiveBlocksuiteEditor();

  const onRefChange = useCallback((container: HTMLDivElement | null) => {
    if (container) {
      assertExists(
        copilotPanelRef.current,
        'copilot panel should be initialized'
      );
      container.append(copilotPanelRef.current);
    }
  }, []);

  if (!editor) {
    return;
  }

  if (!copilotPanelRef.current) {
    copilotPanelRef.current = new CopilotPanel();
  }

  if (editor !== copilotPanelRef.current?.editor) {
    (copilotPanelRef.current as CopilotPanel).editor = editor;
    // (copilotPanelRef.current as CopilotPanel).fitPadding = [20, 20, 20, 20];
  }

  return <div className={styles.root} ref={onRefChange} />;
};

export const copilotExtension: EditorExtension = {
  name: 'copilot',
  icon: <AiIcon />,
  Component: EditorCopilotPanel,
};
