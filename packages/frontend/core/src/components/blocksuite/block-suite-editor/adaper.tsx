import { createReactComponentFromLit } from '@affine/component';
import {
  DocEditor,
  DocTitle,
  EdgelessEditor,
  PageMetaTags,
} from '@blocksuite/presets';
import { type Page } from '@blocksuite/store';
import clsx from 'clsx';
import React, { forwardRef, useEffect, useRef } from 'react';

import { docModeSpecs, edgelessModeSpecs } from './specs';
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
};

interface BlocksuiteDocEditorProps {
  page: Page;
  // todo: add option to replace docTitle with custom component (e.g., for journal page)
}

export const BlocksuiteDocEditor = forwardRef<
  DocEditor,
  BlocksuiteDocEditorProps
>(function BlocksuiteDocEditor({ page }, ref) {
  const titleRef = useRef<DocTitle>(null);

  useEffect(() => {
    // auto focus the title
    setTimeout(() => {
      if (titleRef.current) {
        const richText = titleRef.current.querySelector('rich-text');
        richText?.inlineEditor?.focusEnd();
      }
    });
  }, []);

  return (
    <div className={styles.docEditorRoot}>
      <div className={clsx('affine-doc-viewport', styles.affineDocViewport)}>
        <adapted.DocTitle
          data-affine-doc-title
          className={styles.adapterWrapperContainer}
          page={page}
          ref={titleRef}
        />
        {/* We will replace page meta tags with our own implementation */}
        <adapted.PageMetaTags
          data-affine-page-meta-tags
          className={styles.adapterWrapperContainer}
          page={page}
        />
        <adapted.DocEditor
          data-affine-doc-editor
          className={styles.adapterWrapperContainer}
          ref={ref}
          page={page}
          specs={docModeSpecs}
          hasViewport={false}
        />
      </div>
    </div>
  );
});

export const BlocksuiteEdgelessEditor = forwardRef<
  EdgelessEditor,
  BlocksuiteDocEditorProps
>(function BlocksuiteEdgelessEditor({ page }, ref) {
  return (
    <adapted.EdgelessEditor
      className={styles.adapterWrapperContainer}
      ref={ref}
      page={page}
      specs={edgelessModeSpecs}
    />
  );
});
