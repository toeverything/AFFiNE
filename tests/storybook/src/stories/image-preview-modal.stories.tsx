import { BlockSuiteEditor } from '@affine/core/components/blocksuite/block-suite-editor';
import { ImagePreviewModal } from '@affine/core/components/image-preview';
import type { Meta } from '@storybook/react';
import type { Doc } from '@toeverything/infra';
import {
  PageManager,
  ServiceProviderContext,
  useService,
  Workspace,
} from '@toeverything/infra';
import { initEmptyPage } from '@toeverything/infra';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default {
  title: 'Component/ImagePreviewModal',
  component: ImagePreviewModal,
} satisfies Meta;

export const Default = () => {
  const workspace = useService(Workspace);
  const pageManager = useService(PageManager);

  const [page, setPage] = useState<Doc | null>(null);

  useEffect(() => {
    const bsPage = workspace.docCollection.createDoc('page0');
    initEmptyPage(bsPage);

    const { page, release } = pageManager.open(bsPage.meta!.id);

    fetch(new URL('@affine-test/fixtures/large-image.png', import.meta.url))
      .then(res => res.arrayBuffer())
      .then(async buffer => {
        const id = await workspace.docCollection.blob.set(
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
    setPage(page);

    return () => {
      release();
    };
  }, [pageManager, workspace]);

  if (!page) {
    return null;
  }

  return (
    <ServiceProviderContext.Provider value={page.services}>
      <div
        style={{
          height: '100vh',
          width: '100vw',
          overflow: 'auto',
        }}
      >
        <BlockSuiteEditor mode="page" page={page.blockSuiteDoc} />
        {createPortal(
          <ImagePreviewModal
            pageId={page.id}
            docCollection={page.blockSuiteDoc.collection}
          />,
          document.body
        )}
      </div>
    </ServiceProviderContext.Provider>
  );
};
