import { createReactComponentFromLit } from '@affine/component';
import { useJournalInfoHelper } from '@affine/core/hooks/use-journal';
import {
  BiDirectionalLinkPanel,
  DocEditor,
  DocTitle,
  EdgelessEditor,
  PageMetaTags,
} from '@blocksuite/presets';
import { type Page } from '@blocksuite/store';
import clsx from 'clsx';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { PagePropertiesTable } from '../../affine/page-properties';
import { BlocksuiteEditorJournalDocTitle } from './journal-doc-title';
import {
  docModeSpecs,
  edgelessModeSpecs,
  type InlineRenderers,
  patchSpecs,
} from './specs';
import * as styles from './styles.css';

const adapted = {
  DocEditor: createReactComponentFromLit({
    react: React,
    elementClass: DocEditor,
  }),
  DocTitle: createReactComponentFromLit({
    react: React,
    elementClass: DocTitle,
  }),
  PageMetaTags: createReactComponentFromLit({
    react: React,
    elementClass: PageMetaTags,
  }),
  EdgelessEditor: createReactComponentFromLit({
    react: React,
    elementClass: EdgelessEditor,
  }),
  BiDirectionalLinkPanel: createReactComponentFromLit({
    react: React,
    elementClass: BiDirectionalLinkPanel,
  }),
};

interface BlocksuiteDocEditorProps {
  page: Page;
  customRenderers?: InlineRenderers;
  // todo: add option to replace docTitle with custom component (e.g., for journal page)
}

export const BlocksuiteDocEditor = forwardRef<
  DocEditor,
  BlocksuiteDocEditorProps
>(function BlocksuiteDocEditor({ page, customRenderers }, ref) {
  const titleRef = useRef<DocTitle>(null);
  const docRef = useRef<DocEditor | null>(null);
  const [docPage, setDocPage] =
    useState<HTMLElementTagNameMap['affine-doc-page']>();
  const { isJournal } = useJournalInfoHelper(page.workspace, page.id);

  const onDocRef = useCallback(
    (el: DocEditor) => {
      docRef.current = el;
      if (ref) {
        if (typeof ref === 'function') {
          ref(el);
        } else {
          ref.current = el;
        }
      }
    },
    [ref]
  );

  const specs = useMemo(() => {
    return patchSpecs(docModeSpecs, customRenderers);
  }, [customRenderers]);

  useEffect(() => {
    // auto focus the title
    setTimeout(() => {
      const docPage = docRef.current?.querySelector('affine-doc-page');
      if (docPage) {
        setDocPage(docPage);
      }
      if (titleRef.current) {
        const richText = titleRef.current.querySelector('rich-text');
        richText?.inlineEditor?.focusEnd();
      } else {
        docPage?.focusFirstParagraph();
      }
    });
  }, []);

  return (
    <div className={styles.docEditorRoot}>
      <div className={clsx('affine-doc-viewport', styles.affineDocViewport)}>
        {!isJournal ? (
          <adapted.DocTitle page={page} ref={titleRef} />
        ) : (
          <BlocksuiteEditorJournalDocTitle page={page} />
        )}
        <PagePropertiesTable page={page} />
        <adapted.DocEditor
          className={styles.docContainer}
          ref={onDocRef}
          page={page}
          specs={specs}
          hasViewport={false}
        />
        {docPage ? (
          <adapted.BiDirectionalLinkPanel page={page} docPageBlock={docPage} />
        ) : null}
      </div>
    </div>
  );
});

export const BlocksuiteEdgelessEditor = forwardRef<
  EdgelessEditor,
  BlocksuiteDocEditorProps
>(function BlocksuiteEdgelessEditor({ page, customRenderers }, ref) {
  const specs = useMemo(() => {
    return patchSpecs(edgelessModeSpecs, customRenderers);
  }, [customRenderers]);
  return <adapted.EdgelessEditor ref={ref} page={page} specs={specs} />;
});
