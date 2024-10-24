import {
  type DocMode,
  type NoteBlockModel,
  NoteDisplayMode,
} from '@blocksuite/affine/blocks';
import type {
  AffineEditorContainer,
  DocTitle,
  EdgelessEditor,
  PageEditor,
} from '@blocksuite/affine/presets';
import { type BlockModel, type Doc, Slot } from '@blocksuite/affine/store';
import clsx from 'clsx';
import type React from 'react';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';

import { BlocksuiteDocEditor, BlocksuiteEdgelessEditor } from './lit-adaper';
import * as styles from './styles.css';

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
  const rootRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PageEditor>(null);
  const docTitleRef = useRef<DocTitle>(null);
  const edgelessRef = useRef<EdgelessEditor>(null);

  const slots: BlocksuiteEditorContainerRef['slots'] = useMemo(() => {
    return {
      editorModeSwitched: new Slot(),
      docUpdated: new Slot(),
    };
  }, []);

  useLayoutEffect(() => {
    slots.docUpdated.emit({ newDocId: page.id });
  }, [page, slots.docUpdated]);

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
      get docTitle() {
        return docTitleRef.current;
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

  useImperativeHandle(ref, () => affineEditorContainerProxy, [
    affineEditorContainerProxy,
  ]);

  const handleClickPageModeBlank = useCallback(() => {
    if (shared || page.readonly) return;
    const std = affineEditorContainerProxy.host?.std;
    if (!std) {
      return;
    }
    const note = getLastNoteBlock(page);
    if (note) {
      const lastBlock = note.lastChild();
      if (
        lastBlock &&
        lastBlock.flavour === 'affine:paragraph' &&
        lastBlock.text?.length === 0
      ) {
        std.command.exec('focusBlockEnd' as never, {
          focusBlock: std.view.getBlock(lastBlock.id) as never,
        });
        return;
      }
    }

    std.command.exec('appendParagraph' as never, {});
  }, [affineEditorContainerProxy, page, shared]);

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

// copy from '@blocksuite/affine-shared/utils'
export function getLastNoteBlock(doc: Doc) {
  let note: NoteBlockModel | null = null;
  if (!doc.root) return null;
  const { children } = doc.root;
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (
      matchFlavours(child, ['affine:note']) &&
      child.displayMode !== NoteDisplayMode.EdgelessOnly
    ) {
      note = child as NoteBlockModel;
      break;
    }
  }
  return note;
}
export function matchFlavours<Key extends (keyof BlockSuite.BlockModels)[]>(
  model: BlockModel | null,
  expected: Key
): model is BlockSuite.BlockModels[Key[number]] {
  return (
    !!model &&
    expected.some(
      key => (model.flavour as keyof BlockSuite.BlockModels) === key
    )
  );
}
