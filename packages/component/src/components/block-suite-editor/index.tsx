import type { BlockHub } from '@blocksuite/blocks';
import { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
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
  const editor = editorRef.current;
  assertExists(editorRef, 'editorRef.current should not be null');
  if (editor.mode !== props.mode) {
    editor.mode = props.mode;
  }
  if (editor.page !== props.page) {
    editor.page = props.page;
    if (page.root === null) {
      props.onInit(page, editor);
    }
    props.onLoad?.(page, editor);
  }
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
  }, [page]);
  return (
    <div
      data-testid={`editor-${props.blockSuiteWorkspace.id}-${props.page.id}`}
      className="editor-wrapper"
      style={props.style}
      ref={ref}
    />
  );
};
