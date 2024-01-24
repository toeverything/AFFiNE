import { useActiveBlocksuiteEditor } from '@affine/core/hooks/use-block-suite-editor';
import { assertExists } from '@blocksuite/global/utils';
import { TocIcon } from '@blocksuite/icons';
import { OutlinePanel } from '@blocksuite/presets';
import { useCallback, useRef } from 'react';

import type { EditorExtension } from '../types';
import * as styles from './outline.css';

// A wrapper for TOCNotesPanel
const EditorOutline = () => {
  const outlinePanelRef = useRef<OutlinePanel | null>(null);
  const [editor] = useActiveBlocksuiteEditor();

  const onRefChange = useCallback((container: HTMLDivElement | null) => {
    if (container) {
      assertExists(outlinePanelRef.current, 'toc panel should be initialized');
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

export const outlineExtension: EditorExtension = {
  name: 'outline',
  icon: <TocIcon />,
  Component: EditorOutline,
};
