import { EditorLoading } from '@affine/component/page-detail-skeleton';
import { usePageMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { assertExists } from '@blocksuite/global/utils';
import { DateTimeIcon, PageIcon } from '@blocksuite/icons';
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
  useRef,
} from 'react';
import { type Map as YMap } from 'yjs';

import { BlocksuiteEditorContainer } from './blocksuite-editor-container';
import type { InlineRenderers } from './specs';

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

// TODO: this is a placeholder proof-of-concept implementation
function CustomPageReference({
  reference,
}: {
  reference: HTMLElementTagNameMap['affine-reference'];
}) {
  const workspace = reference.page.workspace;
  const meta = usePageMetaHelper(workspace);
  assertExists(
    reference.delta.attributes?.reference?.pageId,
    'pageId should exist for page reference'
  );
  const referencedPage = meta.getPageMeta(
    reference.delta.attributes.reference.pageId
  );
  const title = referencedPage?.title ?? 'not found';
  let icon = <PageIcon />;
  let lTitle = title.toLowerCase();
  if (title.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)) {
    lTitle = new Date(title).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    icon = <DateTimeIcon />;
  }
  return (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className="page-reference"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0 0.25em',
        columnGap: '0.25em',
      }}
    >
      {icon} <span className="affine-reference-title">{lTitle}</span>
    </a>
  );
}

const customRenderers: InlineRenderers = {
  pageReference(reference) {
    return <CustomPageReference reference={reference} />;
  },
};

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
