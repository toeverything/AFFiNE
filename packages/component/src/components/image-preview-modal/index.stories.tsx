import { initPage } from '@affine/env/blocksuite';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import type { Meta } from '@storybook/react';

import { BlockSuiteEditor } from '../block-suite-editor';
import { ImagePreviewModal } from '.';

export default {
  title: 'Component/ImagePreviewModal',
  component: ImagePreviewModal,
} satisfies Meta;

const workspace = createEmptyBlockSuiteWorkspace(
  'test',
  WorkspaceFlavour.LOCAL
);
const page = workspace.createPage('page0');
initPage(page);
fetch(new URL('@affine-test/fixtures/large-image.png', import.meta.url))
  .then(res => res.arrayBuffer())
  .then(async buffer => {
    const id = await workspace.blobs.set(
      new Blob([buffer], { type: 'image/png' })
    );
    const frameId = page.getBlockByFlavour('affine:frame')[0].id;
    page.addBlock(
      'affine:paragraph',
      {
        text: new page.Text('Please double click the image to preview it.'),
      },
      frameId
    );
    page.addBlock(
      'affine:embed',
      {
        sourceId: id,
      },
      frameId
    );
  });

export const Default = () => {
  return (
    <>
      <div
        style={{
          height: '100vh',
          width: '100vw',
          overflow: 'auto',
        }}
      >
        <BlockSuiteEditor mode="page" page={page} onInit={initPage} />
      </div>
      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
        }}
        id="toolWrapper"
      />
    </>
  );
};
