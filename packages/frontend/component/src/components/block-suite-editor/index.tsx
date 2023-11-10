import { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import { Skeleton } from '@mui/material';
import clsx from 'clsx';
import { use } from 'foxact/use';
import type { CSSProperties, ReactElement } from 'react';
import {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { ErrorBoundary } from 'react-error-boundary';

import {
  blockSuiteEditorHeaderStyle,
  blockSuiteEditorStyle,
} from './index.css';
import { getPresets } from './preset';

interface BlockElement extends Element {
  path: string[];
}

export type EditorProps = {
  page: Page;
  mode: 'page' | 'edgeless';
  defaultSelectedBlockId?: string;
  onModeChange?: (mode: 'page' | 'edgeless') => void;
  // on Editor instance instantiated
  onLoadEditor?: (editor: EditorContainer) => () => void;
  style?: CSSProperties;
  className?: string;
};

export type ErrorBoundaryProps = {
  onReset?: () => void;
};

// a workaround for returning the webcomponent for the given block id
// by iterating over the children of the rendered dom tree
const useBlockElementById = (
  container: HTMLElement | null,
  blockId: string | undefined,
  timeout = 1000
) => {
  const [blockElement, setBlockElement] = useState<BlockElement | null>(null);
  useEffect(() => {
    if (!blockId) {
      return;
    }
    let canceled = false;
    const start = Date.now();
    function run() {
      if (canceled || !container) {
        return;
      }
      const element = container.querySelector(
        `[data-block-id="${blockId}"]`
      ) as BlockElement | null;
      if (element) {
        setBlockElement(element);
      } else if (Date.now() - start < timeout) {
        setTimeout(run, 100);
      }
    }
    run();
    return () => {
      canceled = true;
    };
  }, [container, blockId, timeout]);
  return blockElement;
};

const BlockSuiteEditorImpl = ({
  mode,
  page,
  className,
  defaultSelectedBlockId,
  onLoadEditor,
  onModeChange,
  style,
}: EditorProps): ReactElement => {
  if (!page.loaded) {
    use(page.waitForLoaded());
  }
  assertExists(page, 'page should not be null');
  const editorRef = useRef<EditorContainer | null>(null);
  if (editorRef.current === null) {
    editorRef.current = new EditorContainer();
    editorRef.current.autofocus = true;
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

  useLayoutEffect(() => {
    if (editor) {
      const disposes: (() => void)[] = [];
      const disposeModeSwitch = editor.slots.pageModeSwitched.on(mode => {
        onModeChange?.(mode);
      });
      disposes.push(() => disposeModeSwitch?.dispose());
      if (onLoadEditor) {
        disposes.push(onLoadEditor(editor));
      }
      return () => {
        disposes.forEach(dispose => dispose());
      };
    }
    return;
  }, [editor, onModeChange, onLoadEditor]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    assertExists(editor);
    const container = containerRef.current;
    if (!container) {
      return;
    }
    container.appendChild(editor);
    return () => {
      container.removeChild(editor);
    };
  }, [editor]);

  const blockElement = useBlockElementById(
    containerRef.current,
    defaultSelectedBlockId
  );

  useEffect(() => {
    if (blockElement) {
      requestIdleCallback(() => {
        blockElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center',
        });
        const selectManager = editor.root.value?.selection;
        if (!blockElement.path.length || !selectManager) {
          return;
        }
        const newSelection = selectManager.getInstance('block', {
          path: blockElement.path,
        });
        selectManager.set([newSelection]);
      });
    }
  }, [editor, blockElement]);

  // issue: https://github.com/toeverything/AFFiNE/issues/2004
  return (
    <div
      data-testid={`editor-${page.id}`}
      className={clsx(`editor-wrapper ${editor.mode}-mode`, className)}
      style={style}
      ref={containerRef}
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
