import {
  createReactComponentFromLit,
  useLitPortalFactory,
} from '@affine/component';
import { useJournalInfoHelper } from '@affine/core/hooks/use-journal';
import { WorkbenchService } from '@affine/core/modules/workbench';
import {
  BiDirectionalLinkPanel,
  DocMetaTags,
  DocTitle,
  EdgelessEditor,
  PageEditor,
} from '@blocksuite/presets';
import type { Doc } from '@blocksuite/store';
import { useLiveData, useService } from '@toeverything/infra';
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
  patchReferenceRenderer,
  type ReferenceReactRenderer,
} from './specs/custom/patch-reference-renderer';
import { EdgelessModeSpecs } from './specs/edgeless';
import { PageModeSpecs } from './specs/page';
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

interface BlocksuiteEditorProps {
  page: Doc;
  referenceRenderer?: ReferenceReactRenderer;
  // todo: add option to replace docTitle with custom component (e.g., for journal page)
}

export const BlocksuiteDocEditor = forwardRef<
  PageEditor,
  BlocksuiteEditorProps
>(function BlocksuiteDocEditor({ page, referenceRenderer }, ref) {
  const titleRef = useRef<DocTitle>(null);
  const docRef = useRef<PageEditor | null>(null);
  const [docPage, setDocPage] =
    useState<HTMLElementTagNameMap['affine-page-root']>();
  const { isJournal } = useJournalInfoHelper(page.collection, page.id);

  const workbench = useService(WorkbenchService).workbench;
  const activeView = useLiveData(workbench.activeView$);
  const hash = useLiveData(activeView.location$).hash;

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

  const [reactToLit, portals] = useLitPortalFactory();

  const specs = useMemo(() => {
    if (!referenceRenderer) return PageModeSpecs;
    return patchReferenceRenderer(PageModeSpecs, reactToLit, referenceRenderer);
  }, [reactToLit, referenceRenderer]);

  useEffect(() => {
    // auto focus the title
    setTimeout(() => {
      const docPage = docRef.current?.querySelector('affine-page-root');
      if (docPage) {
        setDocPage(docPage);
      }
      if (titleRef.current && !hash) {
        const richText = titleRef.current.querySelector('rich-text');
        richText?.inlineEditor?.focusEnd();
      } else {
        docPage?.focusFirstParagraph();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className={styles.affineDocViewport} style={{ height: '100%' }}>
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
        {docPage && !page.readonly ? (
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
    </>
  );
});

export const BlocksuiteEdgelessEditor = forwardRef<
  EdgelessEditor,
  BlocksuiteEditorProps
>(function BlocksuiteEdgelessEditor({ page, referenceRenderer }, ref) {
  const [reactToLit, portals] = useLitPortalFactory();
  const specs = useMemo(() => {
    if (!referenceRenderer) return EdgelessModeSpecs;
    return patchReferenceRenderer(
      EdgelessModeSpecs,
      reactToLit,
      referenceRenderer
    );
  }, [reactToLit, referenceRenderer]);
  return (
    <>
      <adapted.EdgelessEditor ref={ref} doc={page} specs={specs} />
      {portals.map(p => (
        <Fragment key={p.id}>{p.portal}</Fragment>
      ))}
    </>
  );
});
