import type { BlockHub } from '@blocksuite/blocks';
import { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import { Skeleton } from '@mui/material';
import { use } from 'foxact/use';
import type { CSSProperties, ReactElement } from 'react';
import { memo, Suspense, useCallback, useEffect, useRef } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { ErrorBoundary } from 'react-error-boundary';

import {
  blockSuiteEditorHeaderStyle,
  blockSuiteEditorStyle,
} from './index.css';
import { getPresets } from './preset';

export type EditorProps = {
  page: Page;
  mode: 'page' | 'edgeless';
  onInit: (page: Page, editor: Readonly<EditorContainer>) => void;
  onModeChange?: (mode: 'page' | 'edgeless') => void;
  setBlockHub?: (blockHub: BlockHub | null) => void;
  onLoad?: (page: Page, editor: EditorContainer) => () => void;
  style?: CSSProperties;
  className?: string;
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
  const { onLoad, onModeChange, page, mode, style } = props;
  if (!page.loaded) {
    use(page.waitForLoaded());
  }
  assertExists(page, 'page should not be null');
  const editorRef = useRef<EditorContainer | null>(null);
  const blockHubRef = useRef<BlockHub | null>(null);
  if (editorRef.current === null) {
    editorRef.current = new EditorContainer();
    editorRef.current.autofocus = true;
    globalThis.currentEditor = editorRef.current;
  }
  const editor = editorRef.current;
  assertExists(editorRef, 'editorRef.current should not be null');
  if (editor.mode !== mode) {
    editor.mode = mode;
  }

  if (editor.page !== page) {
    editor.page = page;
  }

  const presets = getPresets();
  editor.pagePreset = presets.pageModePreset;
  editor.edgelessPreset = presets.edgelessModePreset;

  useEffect(() => {
    const disposes = [] as ((() => void) | undefined)[];

    if (editor) {
      const dispose = editor.slots.pageModeSwitched.on(mode => {
        onModeChange?.(mode);
      });

      disposes.push(() => dispose?.dispose());

      if (editor.page && onLoad) {
        disposes.push(onLoad?.(page, editor));
      }
    }

    return () => {
      disposes
        .filter((dispose): dispose is () => void => !!dispose)
        .forEach(dispose => dispose());
    };
  }, [editor, editor.page, page, onLoad, onModeChange]);

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
        <BlockSuiteEditorImpl key={props.page.id} {...props} />
      </Suspense>
    </ErrorBoundary>
  );
});

BlockSuiteEditor.displayName = 'BlockSuiteEditor';
