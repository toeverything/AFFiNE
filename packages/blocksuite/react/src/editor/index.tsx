import type { BlockHub } from '@blocksuite/blocks';
import { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
import type { LitBlockSpec } from '@blocksuite/lit';
import type { Page } from '@blocksuite/store';
import { use } from 'foxact/use';
import type { CSSProperties, ReactElement } from 'react';
import { memo, useCallback, useEffect, useRef } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { ErrorBoundary } from 'react-error-boundary';

export type EditorProps = {
  page: Page;
  mode: 'page' | 'edgeless';
  onInit: (page: Page, editor: Readonly<EditorContainer>) => void;
  setBlockHub?: (blockHub: BlockHub | null) => void;
  onLoad?: (page: Page, editor: EditorContainer) => () => void;
  style?: CSSProperties;
  className?: string;
  pagePreset?: LitBlockSpec[];
  edgelessPreset?: LitBlockSpec[];
};

export type ErrorBoundaryProps = {
  onReset?: () => void;
};

const BlockSuiteEditorImpl = (props: EditorProps): ReactElement => {
  const { onLoad, page, mode, style } = props;
  if (!page.loaded) {
    use(page.waitForLoaded());
  }
  assertExists(page, 'page should not be null');
  const editorRef = useRef<EditorContainer | null>(null);
  const blockHubRef = useRef<BlockHub | null>(null);
  if (editorRef.current === null) {
    editorRef.current = new EditorContainer();
    editorRef.current.autofocus = true;

    // set page preset
    if (props.pagePreset) editorRef.current.pagePreset = props.pagePreset;
    if (props.edgelessPreset)
      editorRef.current.edgelessPreset = props.edgelessPreset;
  }
  const editor = editorRef.current;
  assertExists(editorRef, 'editorRef.current should not be null');
  if (editor.mode !== mode) {
    editor.mode = mode;
  }

  if (editor.page !== page) {
    editor.page = page;
  }

  useEffect(() => {
    if (editor.page && onLoad) {
      const disposes = [] as ((() => void) | undefined)[];
      disposes.push(onLoad?.(page, editor));
      return () => {
        disposes
          .filter((dispose): dispose is () => void => !!dispose)
          .forEach(dispose => dispose());
      };
    }
    return;
  }, [editor, editor.page, page, onLoad]);

  const ref = useRef<HTMLDivElement>(null);

  const setBlockHub = props.setBlockHub;

  useEffect(() => {
    const editor = editorRef.current;
    assertExists(editor);
    const container = ref.current;
    if (!container) {
      return;
    }
    container.appendChild(editor);
    return () => {
      container.removeChild(editor);
    };
  }, [editor]);

  useEffect(() => {
    if (page.meta.trash) {
      return;
    }
    editor
      .createBlockHub()
      .then(blockHub => {
        if (blockHubRef.current) {
          blockHubRef.current.remove();
        }
        blockHubRef.current = blockHub;
        if (setBlockHub) {
          setBlockHub(blockHub);
        }
      })
      .catch(err => {
        console.error(err);
      });
    return () => {
      if (setBlockHub) {
        setBlockHub(null);
      }
      blockHubRef.current?.remove();
    };
  }, [editor, page.awarenessStore, page.meta.trash, setBlockHub]);

  // issue: https://github.com/toeverything/AFFiNE/issues/2004
  const className = `editor-wrapper ${editor.mode}-mode ${
    props.className || ''
  }`;
  return (
    <div
      data-testid={`editor-${page.id}`}
      className={className}
      style={style}
      ref={ref}
    />
  );
};

const BlockSuiteErrorFallback = (
  props: FallbackProps & ErrorBoundaryProps
): ReactElement => {
  return (
    <div>
      <h1>Sorry.. there was an error</h1>
      <div>{props.error.message}</div>
      <button
        data-testid="error-fallback-reset-button"
        onClick={useCallback(() => {
          props.onReset?.();
          props.resetErrorBoundary();
        }, [props])}
      >
        Try again
      </button>
    </div>
  );
};

export const BlockSuiteEditor = memo(function BlockSuiteEditor(
  props: EditorProps & ErrorBoundaryProps
): ReactElement {
  return (
    <ErrorBoundary
      fallbackRender={useCallback(
        (fallbackProps: FallbackProps) => (
          <BlockSuiteErrorFallback {...fallbackProps} onReset={props.onReset} />
        ),
        [props.onReset]
      )}
    >
      <BlockSuiteEditorImpl key={props.page.id} {...props} />
    </ErrorBoundary>
  );
});

BlockSuiteEditor.displayName = 'BlockSuiteEditor';
