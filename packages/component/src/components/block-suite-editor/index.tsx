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
import { bookmarkPlugin } from './plugins/bookmark';

export type EditorPlugin = {
  flavour: string;
  onInit?: (page: Page, editor: Readonly<EditorContainer>) => void;
  onLoad?: (page: Page, editor: EditorContainer) => () => void;
  render?: (props: { page: Page }) => ReactElement | null;
};

export type EditorProps = {
  page: Page;
  mode: 'page' | 'edgeless';
  onInit: (page: Page, editor: Readonly<EditorContainer>) => void;
  onLoad?: (page: Page, editor: EditorContainer) => () => void;
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

// todo(himself65): plugin-infra should support this
const plugins = [bookmarkPlugin];

const BlockSuiteEditorImpl = (props: EditorProps): ReactElement => {
  const { onLoad, page, mode, style, onInit } = props;
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
  }
  const editor = editorRef.current;
  assertExists(editorRef, 'editorRef.current should not be null');
  if (editor.mode !== mode) {
    editor.mode = mode;
  }

  useEffect(() => {
    if (editor.page !== page) {
      editor.page = page;
      if (page.root === null) {
        onInit(page, editor);
        plugins.forEach(plugin => {
          plugin.onInit?.(page, editor);
        });
      }
    }
  }, [editor, page, onInit]);

  useEffect(() => {
    if (editor.page && onLoad) {
      const disposes = [] as ((() => void) | undefined)[];
      disposes.push(onLoad?.(page, editor));
      disposes.push(...plugins.map(plugin => plugin.onLoad?.(page, editor)));
      return () => {
        disposes
          .filter((dispose): dispose is () => void => !!dispose)
          .forEach(dispose => dispose());
      };
    }
  }, [editor, editor.page, page, onLoad]);

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
      {plugins.map(plugin => {
        const Renderer = plugin.render;
        return Renderer ? (
          <Renderer page={props.page} key={plugin.flavour} />
        ) : null;
      })}
    </ErrorBoundary>
  );
});

BlockSuiteEditor.displayName = 'BlockSuiteEditor';
