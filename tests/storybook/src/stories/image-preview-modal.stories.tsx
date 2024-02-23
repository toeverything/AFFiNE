import { BlockSuiteEditor } from '@affine/core/components/blocksuite/block-suite-editor';
import { ImagePreviewModal } from '@affine/core/components/image-preview';
import { CurrentPageService } from '@affine/core/modules/page';
import type { Page } from '@blocksuite/store';
import type { Meta } from '@storybook/react';
import { PageManager, useService, Workspace } from '@toeverything/infra';
import { initEmptyPage } from '@toeverything/infra/blocksuite';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default {
  title: 'Component/ImagePreviewModal',
  component: ImagePreviewModal,
} satisfies Meta;

export const Default = () => {
  const workspace = useService(Workspace);
  const pageManager = useService(PageManager);
  const currentPageService = useService(CurrentPageService);

  const [page, setPage] = useState<Page | null>(null);

  useEffect(() => {
    const bsPage = workspace.blockSuiteWorkspace.createPage('page0');
    initEmptyPage(bsPage);

    const { page, release } = pageManager.open(bsPage.meta);
    currentPageService.openPage(page);

    fetch(new URL('@affine-test/fixtures/large-image.png', import.meta.url))
      .then(res => res.arrayBuffer())
      .then(async buffer => {
        const id = await workspace.blockSuiteWorkspace.blob.set(
          new Blob([buffer], { type: 'image/png' })
        );
        const frameId = bsPage.getBlockByFlavour('affine:note')[0].id;
        bsPage.addBlock(
          'affine:paragraph',
          {
            text: new bsPage.Text(
              'Please double click the image to preview it.'
            ),
          },
          frameId
        );
        bsPage.addBlock(
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
    setPage(bsPage);

    return () => {
      release();
      currentPageService.closePage();
    };
  }, [currentPageService, pageManager, workspace]);

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
