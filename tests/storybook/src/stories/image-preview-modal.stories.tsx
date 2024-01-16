import { BlockSuiteEditor } from '@affine/core/components/blocksuite/block-suite-editor';
import { ImagePreviewModal } from '@affine/core/components/image-preview';
import { waitForCurrentWorkspaceAtom } from '@affine/core/modules/workspace';
import type { Page } from '@blocksuite/store';
import type { Meta } from '@storybook/react';
import { initEmptyPage } from '@toeverything/infra/blocksuite';
import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default {
  title: 'Component/ImagePreviewModal',
  component: ImagePreviewModal,
} satisfies Meta;

export const Default = () => {
  const workspace = useAtomValue(waitForCurrentWorkspaceAtom);

  const [page, setPage] = useState<Page | null>(null);

  useEffect(() => {
    const page = workspace.blockSuiteWorkspace.createPage('page0');
    initEmptyPage(page);
    fetch(new URL('@affine-test/fixtures/large-image.png', import.meta.url))
      .then(res => res.arrayBuffer())
      .then(async buffer => {
        const id = await workspace.blockSuiteWorkspace.blob.set(
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
    setPage(page);
  }, [workspace]);

  if (!page) {
    return null;
  }

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        overflow: 'auto',
      }}
    >
      <BlockSuiteEditor mode="page" page={page} />
      {createPortal(
        <ImagePreviewModal pageId={page.id} workspace={page.workspace} />,
        document.body
      )}
    </div>
  );
};
