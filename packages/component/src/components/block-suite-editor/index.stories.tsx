/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import { __unstableSchemas, builtInSchemas } from '@blocksuite/blocks/models';
import { EditorContainer } from '@blocksuite/editor';
import { Page, Workspace } from '@blocksuite/store';
import { expect } from '@storybook/jest';
import { Meta, StoryFn } from '@storybook/react';
import { useEffect, useState } from 'react';

import { BlockSuiteEditor, EditorProps } from '.';

function initPage(page: Page, editor: Readonly<EditorContainer>): void {
  // Add page block and surface block at root level
  const pageBlockId = page.addBlockByFlavour('affine:page', {
    title: new page.Text(''),
  });
  page.addBlockByFlavour('affine:surface', {}, null);
  const frameId = page.addBlockByFlavour('affine:frame', {}, pageBlockId);
  page.addBlockByFlavour('affine:paragraph', {}, frameId);
  page.resetHistory();
}

const blockSuiteWorkspace = new Workspace({
  id: 'test',
  blobOptionsGetter: () => void 0,
});
blockSuiteWorkspace.register(builtInSchemas).register(__unstableSchemas);
const promise = new Promise<void>(resolve => {
  blockSuiteWorkspace.slots.pageAdded.once(() => {
    resolve();
  });
});
blockSuiteWorkspace.createPage('page0');

type BlockSuiteMeta = Meta<typeof BlockSuiteEditor>;
export default {
  title: 'BlockSuite/Editor',
  component: BlockSuiteEditor,
} satisfies BlockSuiteMeta;

const Template: StoryFn<EditorProps> = (args: EditorProps) => {
  const [loaded, setLoaded] = useState(false);
  const page = blockSuiteWorkspace.getPage('page0');
  useEffect(() => {
    promise
      .then(() => setLoaded(true))
      .then(() => {
        document.dispatchEvent(new Event('blocksuite:ready'));
      });
  }, []);
  if (!loaded || !page) return <div>Loading...</div>;
  return (
    <BlockSuiteEditor
      {...args}
      blockSuiteWorkspace={blockSuiteWorkspace}
      page={page}
    />
  );
};
export const Empty = Template.bind({});
Empty.play = async ({ canvasElement }) => {
  await new Promise<void>(resolve => {
    document.addEventListener('blocksuite:ready', () => resolve(), {
      once: true,
    });
  });

  const editorContainer = canvasElement.querySelector(
    '[data-testid="editor-test-page0"]'
  ) as HTMLDivElement;
  expect(editorContainer).not.toBeNull();
  await new Promise<void>(resolve => {
    setTimeout(() => resolve(), 50);
  });
  const editor = editorContainer.querySelector(
    'editor-container'
  ) as EditorContainer;
  expect(editor).not.toBeNull();
};

Empty.args = {
  onInit: initPage,
  mode: 'page',
};
