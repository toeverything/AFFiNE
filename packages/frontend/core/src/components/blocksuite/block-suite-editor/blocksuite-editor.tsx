import { EditorLoading } from '@affine/component/page-detail-skeleton';
import { useDocMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { useJournalHelper } from '@affine/core/hooks/use-journal';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import type { AffineEditorContainer } from '@blocksuite/presets';
import type { Doc } from '@blocksuite/store';
import { use } from 'foxact/use';
import type { CSSProperties, ReactElement } from 'react';
import {
  forwardRef,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { type Map as YMap } from 'yjs';

import {
  pageReferenceRenderer,
  type PageReferenceRendererOptions,
} from '../../affine/reference-link';
import { BlocksuiteEditorContainer } from './blocksuite-editor-container';
import type { InlineRenderers } from './specs';

export type ErrorBoundaryProps = {
  onReset?: () => void;
};

export type EditorProps = {
  page: Doc;
  mode: 'page' | 'edgeless';
  defaultSelectedBlockId?: string;
  // on Editor instance instantiated
  onLoadEditor?: (editor: AffineEditorContainer) => () => void;
  style?: CSSProperties;
  className?: string;
};

function usePageRoot(page: Doc) {
  if (!page.ready) {
    page.load();
  }

  if (!page.root) {
    use(
      new Promise<void>((resolve, reject) => {
        const disposable = page.slots.rootAdded.once(() => {
          resolve();
        });
        window.setTimeout(() => {
          disposable.dispose();
          reject(new NoPageRootError(page));
        }, 20 * 1000);
      })
    );
  }

  return page.root;
}

// we cannot pass components to lit renderers, but give them the rendered elements
const customRenderersFactory: (
  opts: Omit<PageReferenceRendererOptions, 'pageId'>
) => InlineRenderers = opts => ({
  pageReference(reference) {
    const pageId = reference.delta.attributes?.reference?.pageId;
    if (!pageId) {
      return <span />;
    }
    return pageReferenceRenderer({
      ...opts,
      pageId,
    });
  },
});

/**
 * TODO: Define error to unexpected state together in the future.
 */
export class NoPageRootError extends Error {
  constructor(public page: Doc) {
    super('Page root not found when render editor!');

    // Log info to let sentry collect more message
    const hasExpectSpace = Array.from(page.rootDoc.spaces.values()).some(
      doc => page.spaceDoc.guid === doc.guid
    );
    const blocks = page.spaceDoc.getMap('blocks') as YMap<YMap<any>>;
    const havePageBlock = Array.from(blocks.values()).some(
      block => block.get('sys:flavour') === 'affine:page'
    );
    console.info(
      'NoPageRootError current data: %s',
      JSON.stringify({
        expectPageId: page.id,
        expectGuid: page.spaceDoc.guid,
        hasExpectSpace,
        blockSize: blocks.size,
        havePageBlock,
      })
    );
  }
}

const BlockSuiteEditorImpl = forwardRef<AffineEditorContainer, EditorProps>(
  function BlockSuiteEditorImpl(
    { mode, page, className, defaultSelectedBlockId, onLoadEditor, style },
    ref
  ) {
    usePageRoot(page);
    assertExists(page, 'page should not be null');
    const editorDisposeRef = useRef<() => void>(() => {});
    const editorRef = useRef<AffineEditorContainer | null>(null);

    const onRefChange = useCallback(
      (editor: AffineEditorContainer | null) => {
        editorRef.current = editor;
        if (ref) {
          if (typeof ref === 'function') {
            ref(editor);
          } else {
            ref.current = editor;
          }
        }
        if (editor && onLoadEditor) {
          editorDisposeRef.current = onLoadEditor(editor);
        }
      },
      [onLoadEditor, ref]
    );

    useEffect(() => {
      return () => {
        editorDisposeRef.current();
      };
    }, []);

    const pageMetaHelper = useDocMetaHelper(page.workspace);
    const journalHelper = useJournalHelper(page.workspace);
    const t = useAFFiNEI18N();

    const customRenderers = useMemo(() => {
      return customRenderersFactory({
        pageMetaHelper,
        journalHelper,
        t,
      });
    }, [journalHelper, pageMetaHelper, t]);

    return (
      <BlocksuiteEditorContainer
        mode={mode}
        page={page}
        ref={onRefChange}
        className={className}
        style={style}
        customRenderers={customRenderers}
        defaultSelectedBlockId={defaultSelectedBlockId}
      />
    );
  }
);

export const BlockSuiteEditor = memo(
  forwardRef<AffineEditorContainer, EditorProps>(
    function BlockSuiteEditor(props, ref): ReactElement {
      return (
        <Suspense fallback={<EditorLoading />}>
          <BlockSuiteEditorImpl key={props.page.id} ref={ref} {...props} />
        </Suspense>
      );
    }
  )
);

BlockSuiteEditor.displayName = 'BlockSuiteEditor';
