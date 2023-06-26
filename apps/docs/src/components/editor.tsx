'use client';
import '@blocksuite/editor/themes/affine.css';

import { BlockSuiteEditor } from '@affine/component/block-suite-editor';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Workspace } from '@blocksuite/store';
import type { ReactElement } from 'react';
import { use, useCallback } from 'react';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

export type EditorProps = {
  workspaceId: string;
  pageId: string;
  binary?: number[];
  onSave: (binary: any) => Promise<void>;
};

const workspace = new Workspace({
  id: 'test-workspace',
})
  .register(AffineSchemas)
  .register(__unstableSchemas);

const page = workspace.createPage({
  id: 'page0',
});

globalThis.workspace = workspace;
globalThis.page = page;

export const Editor = (props: EditorProps): ReactElement => {
  const save = props.onSave;
  if (props.binary && !page.root) {
    use(
      page.waitForLoaded().then(() => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        applyUpdate(page._ySpaceDoc, new Uint8Array(props.binary as number[]));
      })
    );
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
  const onSave = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    save(encodeStateAsUpdate(page._ySpaceDoc));
  }, [save]);
  return (
    <>
      <button onClick={onSave}>save</button>
      <BlockSuiteEditor page={page} mode="page" onInit={() => {}} />
    </>
  );
};
