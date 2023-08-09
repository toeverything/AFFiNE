import { editorContainerModuleAtom } from '@affine/jotai';
import type { BlockHub } from '@blocksuite/blocks';
import type { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
import type { LitBlockSpec } from '@blocksuite/lit';
import type { Page } from '@blocksuite/store';
import { Skeleton } from '@mui/material';
import { use } from 'foxact/use';
import { useAtomValue } from 'jotai';
import type { CSSProperties, ReactElement } from 'react';
import { memo, Suspense, useCallback, useEffect, useRef } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { ErrorBoundary } from 'react-error-boundary';

import {
  blockSuiteEditorHeaderStyle,
  blockSuiteEditorStyle,
} from './index.css';

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

declare global {
  // eslint-disable-next-line no-var
  var currentPage: Page | undefined;
  // eslint-disable-next-line no-var
  var currentEditor: EditorContainer | undefined;
}

const BlockSuiteEditorImpl = (props: EditorProps): ReactElement => {
  const { onLoad, page, mode, style } = props;
  if (!page.loaded) {
    use(page.waitForLoaded());
  }
  const JotaiEditorContainer = useAtomValue(
    editorContainerModuleAtom
  ) as typeof EditorContainer;
  assertExists(page, 'page should not be null');
  const editorRef = useRef<EditorContainer | null>(null);
  const blockHubRef = useRef<BlockHub | null>(null);
  if (editorRef.current === null) {
    editorRef.current = new JotaiEditorContainer();
    editorRef.current.autofocus = true;
    globalThis.currentEditor = editorRef.current;

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
  }, [editor, page.awarenessStore, setBlockHub]);

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
        onClick={() => {
          props.onReset?.();
          props.resetErrorBoundary();
        }}
      >
        Try again
      </button>
    </div>
  );
};

export const BlockSuiteFallback = memo(function BlockSuiteFallback() {
  return (
    <div className={blockSuiteEditorStyle}>
      <Skeleton
        className={blockSuiteEditorHeaderStyle}
        animation="wave"
        height={50}
      />
      <Skeleton animation="wave" height={30} width="40%" />
    </div>
  );
});

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
      <Suspense fallback={<BlockSuiteFallback />}>
        <BlockSuiteEditorImpl {...props} />
      </Suspense>
    </ErrorBoundary>
  );
});

BlockSuiteEditor.displayName = 'BlockSuiteEditor';
