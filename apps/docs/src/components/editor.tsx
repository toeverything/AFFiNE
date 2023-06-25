'use client';
import '@blocksuite/editor/themes/affine.css';

import { BlockSuiteEditor } from '@affine/component/block-suite-editor';
import { ContentParser } from '@blocksuite/blocks/content-parser';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { assertExists, Workspace } from '@blocksuite/store';
import type { ReactElement } from 'react';
import { useCallback } from 'react';

const workspace = new Workspace({
  id: 'local-workspace',
})
  .register(AffineSchemas)
  .register(__unstableSchemas);

const page = workspace.createPage({
  id: 'example-page',
});

export type EditorProps = {
  text: string;
};

export const Editor = (props: EditorProps): ReactElement => {
  return (
    <BlockSuiteEditor
      page={page}
      mode="page"
      onInit={useCallback(
        async page => {
          const text = props.text;
          await page.waitForLoaded();
          const metadata = text.split('---\n')[1];
          assertExists(metadata);

          // find title
          const title = metadata.split('title: ')[1]?.split('\n')[0];
          const pageBlockId = page.addBlock('affine:page', {
            title: new page.Text(title),
          });
          page.addBlock('affine:surface', {}, pageBlockId);
          const noteBlockId = page.addBlock('affine:note', {}, pageBlockId);
          const contentParser = new ContentParser(page);
          const content = text.split('---\n').splice(2).join('---\n');
          assertExists(content);
          await contentParser.importMarkdown(content, noteBlockId);
          page.awarenessStore.setReadonly(page, true);
          page.awarenessStore.setFlag('enable_drag_handle', false);
        },
        [props.text]
      )}
    />
  );
};
