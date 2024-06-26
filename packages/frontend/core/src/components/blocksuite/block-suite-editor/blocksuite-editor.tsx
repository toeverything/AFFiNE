import { EditorLoading } from '@affine/component/page-detail-skeleton';
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
  useRef,
} from 'react';

import { BlocksuiteEditorContainer } from './blocksuite-editor-container';
import { NoPageRootError } from './no-page-error';

export type ErrorBoundaryProps = {
  onReset?: () => void;
};

export type EditorProps = {
  page: Doc;
  mode: 'page' | 'edgeless';
  shared?: boolean;
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

const BlockSuiteEditorImpl = forwardRef<AffineEditorContainer, EditorProps>(
  function BlockSuiteEditorImpl(
    {
      mode,
      page,
      className,
      defaultSelectedBlockId,
      onLoadEditor,
      shared,
      style,
    },
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
      const disposable = page.slots.blockUpdated.once(() => {
        page.collection.setDocMeta(page.id, {
          updatedDate: Date.now(),
        });
      });
      return () => {
        disposable.dispose();
      };
    }, [page]);

    useEffect(() => {
      return () => {
        editorDisposeRef.current();
      };
    }, []);

    return (
      <BlocksuiteEditorContainer
        mode={mode}
        page={page}
        shared={shared}
        ref={onRefChange}
        className={className}
        style={style}
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
