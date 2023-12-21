import { editorContainerAtom } from '@affine/component/block-suite-editor';
import { assertExists } from '@blocksuite/global/utils';
import { TocIcon } from '@blocksuite/icons';
import { TOCPanel } from '@blocksuite/presets';
import { useAtom } from 'jotai';
import { useCallback, useRef } from 'react';

import type { EditorExtension } from '../types';
import * as styles from './outline.css';

// A wrapper for TOCNotesPanel
const EditorOutline = () => {
  const tocPanelRef = useRef<TOCPanel | null>(null);
  const [editorContainer] = useAtom(editorContainerAtom);

  const onRefChange = useCallback((container: HTMLDivElement | null) => {
    if (container) {
      assertExists(tocPanelRef.current, 'toc panel should be initialized');
      container.append(tocPanelRef.current);
    }
  }, []);

  if (!editorContainer) {
    return;
  }

  if (!tocPanelRef.current) {
    tocPanelRef.current = new TOCPanel();
  }

  if (editorContainer !== tocPanelRef.current?.editor) {
    (tocPanelRef.current as TOCPanel).editor = editorContainer;
    (tocPanelRef.current as TOCPanel).fitPadding = [20, 20, 20, 20];
  }

  return <div className={styles.root} ref={onRefChange} />;
};

export const outlineExtension: EditorExtension = {
  name: 'outline',
  icon: <TocIcon />,
  Component: EditorOutline,
};
