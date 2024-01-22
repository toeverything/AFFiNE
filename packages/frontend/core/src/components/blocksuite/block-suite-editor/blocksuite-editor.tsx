import { EditorLoading } from '@affine/component/page-detail-skeleton';
import { usePageMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { useJournalHelper } from '@affine/core/hooks/use-journal';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { LinkedPageIcon, TodayIcon } from '@blocksuite/icons';
import type { AffineEditorContainer } from '@blocksuite/presets';
import type { Page } from '@blocksuite/store';
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

import { BlocksuiteEditorContainer } from './blocksuite-editor-container';
import type { InlineRenderers } from './specs';
import * as styles from './styles.css';

export type ErrorBoundaryProps = {
  onReset?: () => void;
};

export type EditorProps = {
  page: Page;
  mode: 'page' | 'edgeless';
  defaultSelectedBlockId?: string;
  // on Editor instance instantiated
  onLoadEditor?: (editor: AffineEditorContainer) => () => void;
  style?: CSSProperties;
  className?: string;
};

/**
 * TODO: Defined async cache to support suspense, instead of reflect symbol to provider persistent error cache.
 */
const PAGE_LOAD_KEY = Symbol('PAGE_LOAD');
const PAGE_ROOT_KEY = Symbol('PAGE_ROOT');

function usePageRoot(page: Page) {
  let load$ = Reflect.get(page, PAGE_LOAD_KEY);
  if (!load$) {
    load$ = page.load();
    Reflect.set(page, PAGE_LOAD_KEY, load$);
  }
  use(load$);

  if (!page.root) {
    let root$: Promise<void> | undefined = Reflect.get(page, PAGE_ROOT_KEY);
    if (!root$) {
      root$ = new Promise((resolve, reject) => {
        const disposable = page.slots.rootAdded.once(() => {
          resolve();
        });
        window.setTimeout(() => {
          disposable.dispose();
          reject(new NoPageRootError(page));
        }, 20 * 1000);
      });
      Reflect.set(page, PAGE_ROOT_KEY, root$);
    }
    use(root$);
  }

  return page.root;
}

interface PageReferenceProps {
  reference: HTMLElementTagNameMap['affine-reference'];
  pageMetaHelper: ReturnType<typeof usePageMetaHelper>;
  journalHelper: ReturnType<typeof useJournalHelper>;
  t: ReturnType<typeof useAFFiNEI18N>;
}

// TODO: this is a placeholder proof-of-concept implementation
function customPageReference({
  reference,
  pageMetaHelper,
  journalHelper,
  t,
}: PageReferenceProps) {
  const { isPageJournal, getLocalizedJournalDateString } = journalHelper;
  assertExists(
    reference.delta.attributes?.reference?.pageId,
    'pageId should exist for page reference'
  );
  const pageId = reference.delta.attributes.reference.pageId;
  const referencedPage = pageMetaHelper.getPageMeta(pageId);
  let title =
    referencedPage?.title ?? t['com.affine.editor.reference-not-found']();
  let icon = <LinkedPageIcon className={styles.pageReferenceIcon} />;
  const isJournal = isPageJournal(pageId);
  const localizedJournalDate = getLocalizedJournalDateString(pageId);
  if (isJournal && localizedJournalDate) {
    title = localizedJournalDate;
    icon = <TodayIcon className={styles.pageReferenceIcon} />;
  }
  return (
    <>
      {icon}
      <span className="affine-reference-title">{title}</span>
    </>
  );
}

// we cannot pass components to lit renderers, but give them the rendered elements
const customRenderersFactory: (
  opts: Omit<PageReferenceProps, 'reference'>
) => InlineRenderers = opts => ({
  pageReference(reference) {
    return customPageReference({
      ...opts,
      reference,
    });
  },
});

/**
 * TODO: Define error to unexpected state together in the future.
 */
export class NoPageRootError extends Error {
  constructor(public page: Page) {
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

    const pageMetaHelper = usePageMetaHelper(page.workspace);
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
