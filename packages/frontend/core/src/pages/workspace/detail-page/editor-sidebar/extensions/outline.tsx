import { TOCNotesPanel } from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import { TocIcon } from '@blocksuite/icons';
import { useCallback, useRef } from 'react';

import { useCurrentPage } from '../../../../../hooks/current/use-current-page';
import type { EditorExtension } from '../types';
import * as styles from './outline.css';

// A wrapper for TOCNotesPanel
const EditorOutline = () => {
  const tocPanelRef = useRef<TOCNotesPanel | null>(null);
  const currentPage = useCurrentPage();

  const onRefChange = useCallback((container: HTMLDivElement | null) => {
    if (container) {
      assertExists(tocPanelRef.current, 'toc panel should be initialized');
      container.append(tocPanelRef.current);
    }
  }, []);

  if (!currentPage) {
    return;
  }

  if (!tocPanelRef.current) {
    tocPanelRef.current = new TOCNotesPanel();
  }

  if (currentPage !== tocPanelRef.current?.page) {
    (tocPanelRef.current as TOCNotesPanel).page = currentPage;
  }

  return <div className={styles.root} ref={onRefChange} />;
};

export const outlineExtension: EditorExtension = {
  name: 'outline',
  icon: <TocIcon />,
  Component: EditorOutline,
};
