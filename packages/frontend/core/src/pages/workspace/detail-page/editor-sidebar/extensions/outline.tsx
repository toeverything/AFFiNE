import { assertExists } from '@blocksuite/global/utils';
import { TocIcon } from '@blocksuite/icons';
import { TOCPanel } from '@blocksuite/presets';
import { useBlocksuiteEditor } from '@toeverything/hooks/use-block-suite-editor';
import { useCallback, useRef } from 'react';

import type { EditorExtension } from '../types';
import * as styles from './outline.css';

// A wrapper for TOCNotesPanel
const EditorOutline = () => {
  const tocPanelRef = useRef<TOCPanel | null>(null);
  const [editor] = useBlocksuiteEditor();

  const onRefChange = useCallback((container: HTMLDivElement | null) => {
    if (container) {
      assertExists(tocPanelRef.current, 'toc panel should be initialized');
      container.append(tocPanelRef.current);
    }
  }, []);

  if (!editor) {
    return;
  }

  if (!tocPanelRef.current) {
    tocPanelRef.current = new TOCPanel();
  }

  if (editor !== tocPanelRef.current?.editor) {
    (tocPanelRef.current as TOCPanel).editor = editor;
    (tocPanelRef.current as TOCPanel).fitPadding = [20, 20, 20, 20];
  }

  return <div className={styles.root} ref={onRefChange} />;
};

export const outlineExtension: EditorExtension = {
  name: 'outline',
  icon: <TocIcon />,
  Component: EditorOutline,
};
