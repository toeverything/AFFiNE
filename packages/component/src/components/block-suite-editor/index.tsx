import type { BlockHub } from '@blocksuite/blocks';
import { EditorContainer } from '@blocksuite/editor';
import type { Page, Workspace } from '@blocksuite/store';
import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';

export type EditorProps = {
  blockSuiteWorkspace: Workspace;
  page: Page;
  mode: 'page' | 'edgeless';
  onInit: (page: Page, editor: Readonly<EditorContainer>) => void;
  onLoad?: (page: Page, editor: EditorContainer) => void;
  style?: CSSProperties;
};

declare global {
  // eslint-disable-next-line no-var
  var currentBlockSuiteWorkspace: Workspace | undefined;
  // eslint-disable-next-line no-var
  var currentPage: Page | undefined;
  // eslint-disable-next-line no-var
  var currentEditor: EditorContainer | undefined;
}

export const BlockSuiteEditor = (props: EditorProps) => {
  const page = props.page;
  const editorRef = useRef<EditorContainer | null>(null);
  const blockHubRef = useRef<BlockHub | null>(null);
  if (editorRef.current === null) {
    editorRef.current = new EditorContainer();
    globalThis.currentEditor = editorRef.current;
  }
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.mode = props.mode;
    }
  }, [props.mode]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !ref.current || !page) {
      return;
    }

    editor.page = page;
    if (page.root === null) {
      props.onInit(page, editor);
    }
    props.onLoad?.(page, editor);
    return;
  }, [page, props]);

  useEffect(() => {
    const editor = editorRef.current;
    const container = ref.current;

    if (!editor || !container || !page) {
      return;
    }
    if (
      page.awarenessStore.getFlag('enable_block_hub') &&
      props.mode === 'page'
    ) {
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
  }, [page, props.mode]);
  return (
    <div
      data-testid={`editor-${props.blockSuiteWorkspace.id}-${props.page.id}`}
      className="editor-wrapper"
      style={props.style}
      ref={ref}
    />
  );
};
