'use client';
import '@blocksuite/editor/themes/affine.css';

import { BlockSuiteEditor } from '@affine/component/block-suite-editor';
import type { Page } from '@blocksuite/store';
import { useAtomValue } from 'jotai/react';
import type { ReactElement } from 'react';
import { use } from 'react';
import { applyUpdate } from 'yjs';

import { workspaceAtom } from '../atom.js';

export type EditorProps = {
  workspaceId: string;
  pageId: string;
  binary?: number[];
  onSave: (binary: any) => Promise<void>;
};

export const Editor = (props: EditorProps): ReactElement => {
  const workspace = useAtomValue(workspaceAtom);
  let page = workspace.getPage('page0') as Page;
  if (!page) {
    page = workspace.createPage({
      id: 'page0',
    });
  }

  if (props.binary && !page.root) {
    use(
      page.waitForLoaded().then(() => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        applyUpdate(page._ySpaceDoc, new Uint8Array(props.binary as number[]));
      })
    );
    if (import.meta.env.MODE !== 'development') {
      page.awarenessStore.setReadonly(page, true);
    }
  } else if (!page.root) {
    use(
      page.waitForLoaded().then(() => {
        const pageBlockId = page.addBlock('affine:page', {
          title: new page.Text(''),
        });
        page.addBlock('affine:surface', {}, pageBlockId);
        const noteBlockId = page.addBlock('affine:note', {}, pageBlockId);
        page.addBlock('affine:paragraph', {}, noteBlockId);
      })
    );
  }
  return <BlockSuiteEditor page={page} mode="page" onInit={() => {}} />;
};
