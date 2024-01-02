import { assertExists } from '@blocksuite/global/utils';
import { AffineEditorContainer } from '@blocksuite/presets';
import type { Page } from '@blocksuite/store';
import clsx from 'clsx';
import { use } from 'foxact/use';
import type { CSSProperties, ReactElement } from 'react';
import {
  forwardRef,
  memo,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { type Map as YMap } from 'yjs';

import { Skeleton } from '../../ui/skeleton';
import {
  blockSuiteEditorHeaderStyle,
  blockSuiteEditorStyle,
} from './index.css';
import { editorSpecs } from './specs';

interface BlockElement extends Element {
  path: string[];
}

export type EditorProps = {
  page: Page;
  mode: 'page' | 'edgeless';
  defaultSelectedBlockId?: string;
  onModeChange?: (mode: 'page' | 'edgeless') => void;
  // on Editor instance instantiated
  onLoadEditor?: (editor: AffineEditorContainer) => () => void;
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

const BlockSuiteEditorImpl = forwardRef<AffineEditorContainer, EditorProps>(
  (
    {
      mode,
      page,
      className,
      defaultSelectedBlockId,
      onLoadEditor,
      onModeChange,
      style,
    },
    ref
  ): ReactElement => {
    usePageRoot(page);

    assertExists(page, 'page should not be null');
    const editorRef = useRef<AffineEditorContainer | null>(null);
    if (editorRef.current === null) {
      editorRef.current = new AffineEditorContainer();
      editorRef.current.autofocus = true;
    }
    const editor = editorRef.current;
    assertExists(editorRef, 'editorRef.current should not be null');

    if (editor.mode !== mode) {
      editor.mode = mode;
    }

    if (editor.page !== page) {
      editor.page = page;
      editor.docSpecs = editorSpecs.docModeSpecs;
      editor.edgelessSpecs = editorSpecs.edgelessModeSpecs;
    }

    if (ref) {
      if (typeof ref === 'function') {
        ref(editor);
      } else {
        ref.current = editor;
      }
    }

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
      const container = containerRef.current;
      if (!container) {
        return;
      }
      container.append(editor);
      return () => {
        editor.remove();
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
          const selectManager = editor.root?.selection;
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
  }
);
BlockSuiteEditorImpl.displayName = 'BlockSuiteEditorImpl';

export const EditorLoading = memo(function EditorLoading() {
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
