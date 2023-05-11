import { config } from '@affine/env';
import { editorContainerModuleAtom } from '@affine/jotai';
import type { BlockHub } from '@blocksuite/blocks';
import type { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import { Skeleton } from '@mui/material';
import { useAtomValue } from 'jotai';
import type { CSSProperties, ReactElement } from 'react';
import { lazy, memo, Suspense, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  onLoad?: (page: Page, editor: EditorContainer) => void;
  style?: CSSProperties;
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

const ImagePreviewModal = lazy(() =>
  import('../image-preview-modal').then(module => ({
    default: module.ImagePreviewModal,
  }))
);

const BlockSuiteEditorImpl = (props: EditorProps): ReactElement => {
  const JotaiEditorContainer = useAtomValue(
    editorContainerModuleAtom
  ) as typeof EditorContainer;
  const page = props.page;
  assertExists(page, 'page should not be null');
  const editorRef = useRef<EditorContainer | null>(null);
  const blockHubRef = useRef<BlockHub | null>(null);
  if (editorRef.current === null) {
    editorRef.current = new JotaiEditorContainer();
    editorRef.current.autofocus = true;
    globalThis.currentEditor = editorRef.current;
  }
  const editor = editorRef.current;
  assertExists(editorRef, 'editorRef.current should not be null');
  if (editor.mode !== props.mode) {
    editor.mode = props.mode;
  }

  useEffect(() => {
    if (editor.page !== props.page) {
      editor.page = props.page;
      if (page.root === null) {
        props.onInit(page, editor);
      }
      props.onLoad?.(page, editor);
    }
  }, [props.page, props.onInit, props.onLoad, editor, props, page]);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    assertExists(editor);
    const container = ref.current;
    if (!container) {
      return;
    }
    if (page.awarenessStore.getFlag('enable_block_hub')) {
      editor.createBlockHub().then(blockHub => {
        if (blockHubRef.current) {
          blockHubRef.current.remove();
        }
        blockHubRef.current = blockHub;
        const toolWrapper = document.querySelector('#toolWrapper');
        if (!toolWrapper) {
          console.warn(
            'toolWrapper not found, block hub feature will not be available.'
          );
        } else {
          toolWrapper.appendChild(blockHub);
        }
      });
    }

    container.appendChild(editor);
    return () => {
      blockHubRef.current?.remove();
      container.removeChild(editor);
    };
  }, [editor, page]);

  // issue: https://github.com/toeverything/AFFiNE/issues/2004
  const className = `editor-wrapper ${editor.mode}-mode`;
  return (
    <div
      data-testid={`editor-${props.page.id}`}
      className={className}
      style={props.style}
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
      {config.enableImagePreviewModal && props.page && (
        <Suspense fallback={null}>
          {createPortal(
            <ImagePreviewModal
              workspace={props.page.workspace}
              pageId={props.page.id}
            />,
            document.body
          )}
        </Suspense>
      )}
    </ErrorBoundary>
  );
});

BlockSuiteEditor.displayName = 'BlockSuiteEditor';
