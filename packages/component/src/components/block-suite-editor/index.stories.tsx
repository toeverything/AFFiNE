/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import { createMemoryStorage, Workspace } from '@blocksuite/store';
import { expect } from '@storybook/jest';
import type { Meta, StoryFn } from '@storybook/react';
import { useState } from 'react';

import type { EditorProps } from '.';
import { BlockSuiteEditor } from '.';

const blockSuiteWorkspace = new Workspace({
  id: 'test',
  blobStorages: [createMemoryStorage],
});

function initPage(page: Page): void {
  // Add page block and surface block at root level
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text('Hello, world!'),
  });
  page.addBlock('affine:surface', {}, null);
  const frameId = page.addBlock('affine:frame', {}, pageBlockId);
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
initPage(page);

type BlockSuiteMeta = Meta<typeof BlockSuiteEditor>;
export default {
  title: 'BlockSuite/Editor',
  component: BlockSuiteEditor,
} satisfies BlockSuiteMeta;

const Template: StoryFn<EditorProps> = (props: Partial<EditorProps>) => {
  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
      }}
    >
      <BlockSuiteEditor onInit={initPage} page={page} mode="page" {...props} />
      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
        }}
        id="toolWrapper"
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

export const Error: StoryFn = () => {
  const [props, setProps] = useState<Pick<EditorProps, 'page' | 'onInit'>>({
    page: null!,
    onInit: null!,
  });
  return (
    <BlockSuiteEditor
      {...props}
      mode="page"
      onReset={() => {
        setProps({
          page,
          onInit: initPage,
        });
      }}
    />
  );
};

Error.play = async ({ canvasElement }) => {
  {
    const editorContainer = canvasElement.querySelector(
      '[data-testid="editor-page0"]'
    );
    expect(editorContainer).toBeNull();
  }
  {
    const button = canvasElement.querySelector(
      '[data-testid="error-fallback-reset-button"]'
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    await new Promise<void>(resolve => setTimeout(() => resolve(), 50));
  }
  {
    const editorContainer = canvasElement.querySelector(
      '[data-testid="editor-page0"]'
    );
    expect(editorContainer).not.toBeNull();
  }
};
