import type { PageMode } from '@affine/core/atoms';
import type { BlockElement } from '@blocksuite/lit';
import type {
  AffineEditorContainer,
  DocEditor,
  EdgelessEditor,
} from '@blocksuite/presets';
import { type Page, Slot } from '@blocksuite/store';
import clsx from 'clsx';
import type React from 'react';
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { BlocksuiteDocEditor, BlocksuiteEdgelessEditor } from './lit-adaper';
import type { InlineRenderers } from './specs';
import * as styles from './styles.css';

// copy forwardSlot from blocksuite, but it seems we need to dispose the pipe
// after the component is unmounted right?
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function forwardSlot<T extends Record<string, Slot<any>>>(
  from: T,
  to: Partial<T>
) {
  Object.entries(from).forEach(([key, slot]) => {
    const target = to[key];
    if (target) {
      slot.pipe(target);
    }
  });
}

interface BlocksuiteEditorContainerProps {
  page: Page;
  mode: PageMode;
  className?: string;
  style?: React.CSSProperties;
  defaultSelectedBlockId?: string;
  customRenderers?: InlineRenderers;
}

// mimic the interface of the webcomponent and expose slots & host
type BlocksuiteEditorContainerRef = Pick<
  (typeof AffineEditorContainer)['prototype'],
  'mode' | 'page' | 'model' | 'slots' | 'host'
> &
  HTMLDivElement;

function findBlockElementById(container: HTMLElement, blockId: string) {
  const element = container.querySelector(
    `[data-block-id="${blockId}"]`
  ) as BlockElement | null;
  return element;
}

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
      if (canceled || !container || !blockId) {
        return;
      }
      const element = findBlockElementById(container, blockId);
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

export const BlocksuiteEditorContainer = forwardRef<
  AffineEditorContainer,
  BlocksuiteEditorContainerProps
>(function AffineEditorContainer(
  { page, mode, className, style, defaultSelectedBlockId, customRenderers },
  ref
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<DocEditor>(null);
  const edgelessRef = useRef<EdgelessEditor>(null);

  const slots: BlocksuiteEditorContainerRef['slots'] = useMemo(() => {
    return {
      pageLinkClicked: new Slot(),
      pageModeSwitched: new Slot(),
      pageUpdated: new Slot(),
      tagClicked: new Slot(),
    };
  }, []);

  // forward the slot to the webcomponent
  useLayoutEffect(() => {
    requestAnimationFrame(() => {
      const docPage = rootRef.current?.querySelector('affine-doc-page');
      const edgelessPage = rootRef.current?.querySelector(
        'affine-edgeless-page'
      );
      ('affine-edgeless-page');
      if (docPage) {
        forwardSlot(docPage.slots, slots);
      }

      if (edgelessPage) {
        forwardSlot(edgelessPage.slots, slots);
      }
    });
  }, [page, slots]);

  useLayoutEffect(() => {
    slots.pageUpdated.emit({ newPageId: page.id });
  }, [page, slots.pageUpdated]);

  useLayoutEffect(() => {
    slots.pageModeSwitched.emit(mode);
  }, [mode, slots.pageModeSwitched]);

  /**
   * mimic an AffineEditorContainer using proxy
   */
  const affineEditorContainerProxy = useMemo(() => {
    const api = {
      slots,
      get page() {
        return page;
      },
      get host() {
        return mode === 'page'
          ? docRef.current?.host
          : edgelessRef.current?.host;
      },
      get model() {
        return page.root as any;
      },
      get updateComplete() {
        return mode === 'page'
          ? docRef.current?.updateComplete
          : edgelessRef.current?.updateComplete;
      },
    };

    const proxy = new Proxy(api, {
      has(_, prop) {
        return (
          Reflect.has(api, prop) ||
          (rootRef.current ? Reflect.has(rootRef.current, prop) : false)
        );
      },
      get(_, prop) {
        if (Reflect.has(api, prop)) {
          return api[prop as keyof typeof api];
        }
        if (rootRef.current && Reflect.has(rootRef.current, prop)) {
          const maybeFn = Reflect.get(rootRef.current, prop);
          if (typeof maybeFn === 'function') {
            return maybeFn.bind(rootRef.current);
          } else {
            return maybeFn;
          }
        }
        return undefined;
      },
    }) as unknown as AffineEditorContainer;

    return proxy;
  }, [mode, page, slots]);

  useEffect(() => {
    if (ref) {
      if (typeof ref === 'function') {
        ref(affineEditorContainerProxy);
      } else {
        ref.current = affineEditorContainerProxy;
      }
    }
  }, [affineEditorContainerProxy, ref]);

  const blockElement = useBlockElementById(
    rootRef.current,
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
        const selectManager = affineEditorContainerProxy.host?.selection;
        if (!blockElement.path.length || !selectManager) {
          return;
        }
        const newSelection = selectManager.create('block', {
          path: blockElement.path,
        });
        selectManager.set([newSelection]);
      });
    }
  }, [blockElement, affineEditorContainerProxy.host?.selection]);

  return (
    <div
      data-testid={`editor-${page.id}`}
      className={clsx(
        `editor-wrapper ${mode}-mode`,
        styles.docEditorRoot,
        className
      )}
      data-affine-editor-container
      style={style}
      ref={rootRef}
    >
      {mode === 'page' ? (
        <BlocksuiteDocEditor
          page={page}
          ref={docRef}
          customRenderers={customRenderers}
        />
      ) : (
        <BlocksuiteEdgelessEditor
          page={page}
          ref={edgelessRef}
          customRenderers={customRenderers}
        />
      )}
    </div>
  );
});
