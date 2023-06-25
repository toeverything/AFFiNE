import { Button } from '@affine/component';
import { BlockSuiteEditor } from '@affine/component/block-suite-editor';
import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import { initEmptyQuickNotePage } from '@affine/env/blocksuite';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { NoSsr } from '@mui/material';
import { useAtomValue } from 'jotai';
import { Suspense, useCallback, useEffect, useRef } from 'react';

import { quickNotePageAtom } from '../../atoms';
import type { NextPageWithLayout } from '../../shared';
import * as styles from './styles.css';

const QuickNotePage: NextPageWithLayout = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  const page = useAtomValue(quickNotePageAtom);
  const handleHeightChange = useCallback((height: number) => {
    window.apis.ui
      // this function only accepts integer
      .handleQuickNoteHeightChange(Math.ceil(height))
      .catch(console.error);
  }, []);

  const handleHideQuickNote = useCallback(() => {
    window.apis.ui.handleHideQuickNote().catch(console.error);
  }, []);

  const handleAppendToToday = useCallback(() => {
    // todo(pengx17): on append, it will
    // - go to today's journal page
    // - extract the frame (note) and append to today's journal page
    // - close the quick note
    // - destroy the cached page
    handleHideQuickNote();
  }, [handleHideQuickNote]);

  useEffect(() => {
    const container = ref.current;
    if (!container) {
      return;
    }
    const { height } = container.getBoundingClientRect();
    handleHeightChange(height);
    const ob = new ResizeObserver(entries => {
      const { height } = entries[0].contentRect;
      handleHeightChange(height);
    });
    ob.observe(container);
    return () => {
      ob.disconnect();
    };
  }, [handleHeightChange]);

  const t = useAFFiNEI18N();

  return (
    <div ref={ref} className={styles.root}>
      <div className={styles.header}>
        <div className={styles.title}>{t['com.affine.quick-note']()}</div>
      </div>
      <BlockSuiteEditor
        quickNote
        page={page}
        mode="page"
        onInit={initEmptyQuickNotePage}
      />
      <div className={styles.footer}>
        <Button color="primary" type="primary" onClick={handleAppendToToday}>
          {t['com.affine.quick-note.append-to-today']()}
        </Button>
      </div>
    </div>
  );
};

export default QuickNotePage;

QuickNotePage.getLayout = page => {
  return (
    <Suspense fallback={<PageDetailSkeleton />}>
      <NoSsr>{page}</NoSsr>
    </Suspense>
  );
};
