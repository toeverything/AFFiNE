import {
  createReactComponentFromLit,
  useLitPortalFactory,
} from '@affine/component';
import { useJournalInfoHelper } from '@affine/core/hooks/use-journal';
import {
  BiDirectionalLinkPanel,
  DocMetaTags,
  DocTitle,
  EdgelessEditor,
  PageEditor,
} from '@blocksuite/presets';
import { type Doc } from '@blocksuite/store';
import React, {
  forwardRef,
  Fragment,
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
    elementClass: PageEditor,
  }),
  DocTitle: createReactComponentFromLit({
    react: React,
    elementClass: DocTitle,
  }),
  PageMetaTags: createReactComponentFromLit({
    react: React,
    elementClass: DocMetaTags,
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
  page: Doc;
  customRenderers?: InlineRenderers;
  // todo: add option to replace docTitle with custom component (e.g., for journal page)
}

export const BlocksuiteDocEditor = forwardRef<
  PageEditor,
  BlocksuiteDocEditorProps
>(function BlocksuiteDocEditor({ page, customRenderers }, ref) {
  const titleRef = useRef<DocTitle>(null);
  const docRef = useRef<PageEditor | null>(null);
  const [docPage, setDocPage] =
    useState<HTMLElementTagNameMap['affine-page-root']>();
  const { isJournal } = useJournalInfoHelper(page.collection, page.id);

  const onDocRef = useCallback(
    (el: PageEditor) => {
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

  const [litToTemplate, portals] = useLitPortalFactory();

  const specs = useMemo(() => {
    return patchSpecs(docModeSpecs, litToTemplate, customRenderers);
  }, [customRenderers, litToTemplate]);

  useEffect(() => {
    // auto focus the title
    setTimeout(() => {
      const docPage = docRef.current?.querySelector('affine-page-root');
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
      <div className={styles.affineDocViewport}>
        {!isJournal ? (
          <adapted.DocTitle doc={page} ref={titleRef} />
        ) : (
          <BlocksuiteEditorJournalDocTitle page={page} />
        )}
        <PagePropertiesTable page={page} />
        <adapted.DocEditor
          className={styles.docContainer}
          ref={onDocRef}
          doc={page}
          specs={specs}
          hasViewport={false}
        />
        {docPage ? (
          <div
            className={styles.docEditorGap}
            onClick={() => {
              docPage.std.spec.getService('affine:page').appendParagraph();
            }}
          ></div>
        ) : null}
        {docPage && !page.readonly ? (
          <adapted.BiDirectionalLinkPanel doc={page} pageRoot={docPage} />
        ) : null}
      </div>
      {portals.map(p => (
        <Fragment key={p.id}>{p.portal}</Fragment>
      ))}
    </div>
  );
});

export const BlocksuiteEdgelessEditor = forwardRef<
  EdgelessEditor,
  BlocksuiteDocEditorProps
>(function BlocksuiteEdgelessEditor({ page, customRenderers }, ref) {
  const [litToTemplate, portals] = useLitPortalFactory();
  const specs = useMemo(() => {
    return patchSpecs(edgelessModeSpecs, litToTemplate, customRenderers);
  }, [customRenderers, litToTemplate]);
  return (
    <>
      <adapted.EdgelessEditor ref={ref} doc={page} specs={specs} />
      {portals.map(p => (
        <Fragment key={p.id}>{p.portal}</Fragment>
      ))}
    </>
  );
});
