import { createReactComponentFromLit } from '@affine/component';
import {
  BiDirectionalLinkPanel,
  DocEditor,
  DocTitle,
  EdgelessEditor,
  PageMetaTags,
} from '@blocksuite/presets';
import { type Page } from '@blocksuite/store';
import clsx from 'clsx';
import React, { forwardRef, useEffect, useMemo, useRef } from 'react';

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

  const specs = useMemo(() => {
    return patchSpecs(docModeSpecs, customRenderers);
  }, [customRenderers]);

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
        <adapted.DocTitle page={page} ref={titleRef} />
        {/* We will replace page meta tags with our own implementation */}
        <adapted.PageMetaTags page={page} />
        <adapted.DocEditor
          className={styles.docContainer}
          ref={ref}
          page={page}
          specs={specs}
          hasViewport={false}
        />
        <adapted.BiDirectionalLinkPanel page={page} />
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
