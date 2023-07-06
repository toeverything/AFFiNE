import { BlockHubWrapper } from '@affine/component/block-hub';
import { BlockSuiteEditor } from '@affine/component/block-suite-editor';
import { ImagePreviewModal } from '@affine/component/image-preview-modal';
import { initEmptyPage } from '@affine/env/blocksuite';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { rootBlockHubAtom } from '@affine/workspace/atom';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import type { Meta } from '@storybook/react';

export default {
  title: 'Component/ImagePreviewModal',
  component: ImagePreviewModal,
} satisfies Meta;

const workspace = createEmptyBlockSuiteWorkspace(
  'test',
  WorkspaceFlavour.LOCAL
);
const page = workspace.createPage('page0');
initEmptyPage(page);
fetch(new URL('@affine-test/fixtures/large-image.png', import.meta.url))
  .then(res => res.arrayBuffer())
  .then(async buffer => {
    const id = await workspace.blobs.set(
      new Blob([buffer], { type: 'image/png' })
    );
    const frameId = page.getBlockByFlavour('affine:note')[0].id;
    page.addBlock(
      'affine:paragraph',
      {
        text: new page.Text('Please double click the image to preview it.'),
      },
      frameId
    );
    page.addBlock(
      'affine:image',
      {
        sourceId: id,
      },
      frameId
    );
  })
  .catch(err => {
    console.error('Failed to load large-image.png', err);
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
        <BlockSuiteEditor mode="page" page={page} onInit={initEmptyPage} />
      </div>
      <BlockHubWrapper
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
        }}
        blockHubAtom={rootBlockHubAtom}
      />
    </>
  );
};
