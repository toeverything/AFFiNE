'use client';
import '@blocksuite/editor/themes/affine.css';

import { BlockSuiteEditor } from '@affine/component/block-suite-editor';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Workspace } from '@blocksuite/store';
import { useCallback } from 'react';

const workspace = new Workspace({
  id: 'local-workspace',
})
  .register(AffineSchemas)
  .register(__unstableSchemas);

const page = workspace.createPage({
  id: 'example-page',
});

export const Editor = () => {
  return (
    <BlockSuiteEditor
      page={page}
      mode="page"
      onInit={useCallback(async page => {
        await page.waitForLoaded();
        const pageBlockId = page.addBlock('affine:page', {
          title: new page.Text('Hello, world!'),
        });
        page.addBlock('affine:surface', {}, pageBlockId);
        const noteBlockId = page.addBlock('affine:note', {}, pageBlockId);
        page.addBlock(
          'affine:paragraph',
          {
            text: new page.Text('This is AFFiNE Developer Document.'),
          },
          noteBlockId
        );
      }, [])}
    />
  );
};
