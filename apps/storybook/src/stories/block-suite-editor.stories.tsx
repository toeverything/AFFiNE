/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import { BlockHubWrapper } from '@affine/component/block-hub';
import type { EditorProps } from '@affine/component/block-suite-editor';
import { BlockSuiteEditor } from '@affine/component/block-suite-editor';
import { rootBlockHubAtom } from '@affine/workspace/atom';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import { createMemoryStorage, Workspace } from '@blocksuite/store';
import { expect } from '@storybook/jest';
import type { Meta, StoryFn } from '@storybook/react';
import { use } from 'react';

const blockSuiteWorkspace = new Workspace({
  id: 'test',
  blobStorages: [createMemoryStorage],
});

async function initPage(page: Page) {
  await page.waitForLoaded();
  // Add page block and surface block at root level
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text('Hello, world!'),
  });
  page.addBlock('affine:surface', {}, pageBlockId);
  const frameId = page.addBlock('affine:note', {}, pageBlockId);
  page.addBlock(
    'affine:paragraph',
    {
      text: new page.Text('This is a paragraph.'),
    },
    frameId
  );
  page.resetHistory();
}

blockSuiteWorkspace.register(AffineSchemas).register(__unstableSchemas);
const page = blockSuiteWorkspace.createPage('page0');

type BlockSuiteMeta = Meta<typeof BlockSuiteEditor>;
export default {
  title: 'BlockSuite/Editor',
  component: BlockSuiteEditor,
} satisfies BlockSuiteMeta;

const Template: StoryFn<EditorProps> = (props: Partial<EditorProps>) => {
  if (!page.loaded) {
    use(initPage(page));
  }
  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        overflow: 'auto',
      }}
    >
      <BlockSuiteEditor onInit={initPage} page={page} mode="page" {...props} />
      <BlockHubWrapper
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
        }}
        blockHubAtom={rootBlockHubAtom}
      />
    </div>
  );
};

export const Empty = Template.bind({});
Empty.play = async ({ canvasElement }) => {
  await new Promise<void>(resolve => {
    setTimeout(() => resolve(), 500);
  });
  const editorContainer = canvasElement.querySelector(
    '[data-testid="editor-page0"]'
  ) as HTMLDivElement;
  expect(editorContainer).not.toBeNull();
  const editor = editorContainer.querySelector(
    'editor-container'
  ) as EditorContainer;
  expect(editor).not.toBeNull();
};

Empty.args = {
  mode: 'page',
};
