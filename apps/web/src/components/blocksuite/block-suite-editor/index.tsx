import { config } from '@affine/env';
import { BlockHub } from '@blocksuite/blocks';
import { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { CSSProperties, useEffect, useRef } from 'react';

import { BlockSuiteWorkspace } from '../../../shared';

export type EditorProps = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  page: Page;
  mode: 'page' | 'edgeless';
  onInit?: (page: Page, editor: Readonly<EditorContainer>) => void;
  onLoad?: (page: Page, editor: EditorContainer) => void;
  style?: CSSProperties;
};

import markdown from '../../../templates/Welcome-to-AFFiNE-Alpha-Downhills.md';

const exampleTitle = markdown
  .split('\n')
  .splice(0, 1)
  .join('')
  .replaceAll('#', '')
  .trim();
const exampleText = markdown.split('\n').slice(1).join('\n');

const kFirstPage = 'affine-first-page';

declare global {
  // eslint-disable-next-line no-var
  var currentBlockSuiteWorkspace: BlockSuiteWorkspace | undefined;
  // eslint-disable-next-line no-var
  var currentPage: Page | undefined;
}

export const BlockSuiteEditor = (props: EditorProps) => {
  const page = props.page;
  const editorRef = useRef<EditorContainer | null>(null);
  const blockHubRef = useRef<BlockHub | null>(null);
  if (editorRef.current === null) {
    editorRef.current = new EditorContainer();
    // fixme(himself65): remove `globalThis.editor`
    // @ts-expect-error
    globalThis.editor = editorRef.current;
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
      if (props.onInit) {
        props.onInit(page, editor);
      } else {
        console.debug('Initializing page with default content');
        // Add page block and surface block at root level
        const title =
          localStorage.getItem(kFirstPage) === null ? exampleTitle : undefined;
        const pageBlockId = page.addBlockByFlavour('affine:page', {
          title: new page.Text(title),
        });
        page.addBlockByFlavour('affine:surface', {}, null);
        const frameId = page.addBlockByFlavour('affine:frame', {}, pageBlockId);
        page.addBlockByFlavour('affine:paragraph', {}, frameId);
        if (localStorage.getItem(kFirstPage) === null) {
          // fixme(himself65): remove
          editor.clipboard.importMarkdown(exampleText, frameId);
          props.blockSuiteWorkspace.setPageMeta(page.id, { title });
          localStorage.setItem(kFirstPage, 'true');
        }
        page.resetHistory();
      }
    }
    if (config.exposeInternal) {
      globalThis.currentBlockSuiteWorkspace = props.blockSuiteWorkspace;
      globalThis.currentPage = page;
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

    editor.createBlockHub().then(blockHub => {
      if (blockHubRef.current) {
        blockHubRef.current.remove();
      }
      blockHubRef.current = blockHub;
      const toolWrapper = document.querySelector('#toolWrapper');
      assertExists(toolWrapper);
      toolWrapper.appendChild(blockHub);
    });
    container.appendChild(editor);
    return () => {
      blockHubRef.current?.remove();
      container.removeChild(editor);
    };
  }, [page]);
  return (
    <div
      data-testid={`editor-${props.blockSuiteWorkspace.room}-${props.page.id}`}
      className="editor-wrapper"
      style={props.style}
      ref={ref}
    />
  );
};
