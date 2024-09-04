import { EditorService } from '@affine/core/modules/editor';
import type { ReferenceInfo } from '@blocksuite/affine-model';
import type { DocMode } from '@blocksuite/blocks';
import type {
  AffineEditorContainer,
  DocTitle,
  EdgelessEditor,
  PageEditor,
} from '@blocksuite/presets';
import { type Doc, Slot } from '@blocksuite/store';
import { useService } from '@toeverything/infra';
import clsx from 'clsx';
import type React from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';

import { BlocksuiteDocEditor, BlocksuiteEdgelessEditor } from './lit-adaper';
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
  page: Doc;
  mode: DocMode;
  shared?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

// mimic the interface of the webcomponent and expose slots & host
type BlocksuiteEditorContainerRef = Pick<
  (typeof AffineEditorContainer)['prototype'],
  'mode' | 'doc' | 'slots' | 'host'
> &
  HTMLDivElement;

export const BlocksuiteEditorContainer = forwardRef<
  AffineEditorContainer,
  BlocksuiteEditorContainerProps
>(function AffineEditorContainer(
  { page, mode, className, style, shared },
  ref
) {
  const editorService = useService(EditorService);
  const rootRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PageEditor>(null);
  const docTitleRef = useRef<DocTitle>(null);
  const edgelessRef = useRef<EdgelessEditor>(null);

  const slots: BlocksuiteEditorContainerRef['slots'] = useMemo(() => {
    return {
      docLinkClicked: new Slot<ReferenceInfo>(),
      editorModeSwitched: new Slot(),
      docUpdated: new Slot(),
      tagClicked: new Slot(),
    };
  }, []);

  // forward the slot to the webcomponent
  useLayoutEffect(() => {
    requestAnimationFrame(() => {
      const docPage = rootRef.current?.querySelector('affine-page-root');
      const edgelessPage = rootRef.current?.querySelector(
        'affine-edgeless-root'
      );
      if (docPage) {
        forwardSlot(docPage.slots, slots);
      }

      if (edgelessPage) {
        forwardSlot(edgelessPage.slots, slots);
      }
    });
  }, [page, slots]);

  useLayoutEffect(() => {
    slots.docUpdated.emit({ newDocId: page.id });
  }, [page, slots.docUpdated]);

  useLayoutEffect(() => {
    slots.editorModeSwitched.emit(mode);
  }, [mode, slots.editorModeSwitched]);

  /**
   * mimic an AffineEditorContainer using proxy
   */
  const affineEditorContainerProxy = useMemo(() => {
    const api = {
      slots,
      get page() {
        return page;
      },
      get doc() {
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
      get mode() {
        return mode;
      },
      get origin() {
        return rootRef.current;
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
    }) as unknown as AffineEditorContainer & { origin: HTMLDivElement };

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

  useEffect(() => {
    let canceled = false;
    let unsubscribe: () => void = () => {};

    affineEditorContainerProxy.updateComplete
      .then(() => {
        if (!canceled) {
          unsubscribe = editorService.editor.bindEditorContainer(
            affineEditorContainerProxy,
            docTitleRef.current as DocTitle
          );
        }
      })
      .catch(console.error);
    return () => {
      canceled = true;
      unsubscribe();
    };
  }, [affineEditorContainerProxy, mode, editorService]);

  const handleClickPageModeBlank = useCallback(() => {
    affineEditorContainerProxy.host?.std.command.exec(
      'appendParagraph' as never,
      {}
    );
  }, [affineEditorContainerProxy]);

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
          shared={shared}
          page={page}
          ref={docRef}
          titleRef={docTitleRef}
          onClickBlank={handleClickPageModeBlank}
        />
      ) : (
        <BlocksuiteEdgelessEditor
          shared={shared}
          page={page}
          ref={edgelessRef}
        />
      )}
    </div>
  );
});
