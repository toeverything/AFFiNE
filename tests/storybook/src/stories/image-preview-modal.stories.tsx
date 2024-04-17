import { BlockSuiteEditor } from '@affine/core/components/blocksuite/block-suite-editor';
import { ImagePreviewModal } from '@affine/core/components/image-preview';
import type { Meta, StoryFn } from '@storybook/react';
import type { Doc } from '@toeverything/infra';
import {
  DocsService,
  FrameworkScope,
  initEmptyPage,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { mockDateDecorator } from 'storybook-mock-date-decorator';

export default {
  title: 'Component/ImagePreviewModal',
  component: ImagePreviewModal,
} satisfies Meta;

export const Default: StoryFn = () => {
  const workspace = useService(WorkspaceService).workspace;
  const docsService = useService(DocsService);

  const [doc, setDoc] = useState<Doc | null>(null);

  useEffect(() => {
    const bsDoc = workspace.docCollection.createDoc({ id: 'page0' });
    initEmptyPage(bsDoc);

    const { doc, release } = docsService.open(bsDoc.meta!.id);

    fetch(new URL('@affine-test/fixtures/large-image.png', import.meta.url))
      .then(res => res.arrayBuffer())
      .then(async buffer => {
        const id = await workspace.docCollection.blob.set(
          new Blob([buffer], { type: 'image/png' })
        );
        const frameId = bsDoc.getBlockByFlavour('affine:note')[0].id;
        bsDoc.addBlock(
          'affine:paragraph',
          {
            text: new bsDoc.Text(
              'Please double click the image to preview it.'
            ),
          },
          frameId
        );
        bsDoc.addBlock(
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
    setDoc(doc);

    return () => {
      release();
    };
  }, [docsService, workspace]);

  if (!doc) {
    return <div />;
  }

  return (
    <FrameworkScope scope={doc.scope}>
      <div
        style={{
          height: '100vh',
          width: '100vw',
          overflow: 'auto',
        }}
      >
        <BlockSuiteEditor mode="page" page={doc.blockSuiteDoc} />
        {createPortal(
          <ImagePreviewModal
            pageId={doc.id}
            docCollection={doc.blockSuiteDoc.collection}
          />,
          document.body
        )}
      </div>
    </FrameworkScope>
  );
};

Default.decorators = [mockDateDecorator];
Default.parameters = {
  date: new Date('Mon, 25 Mar 2024 08:39:07 GMT'),
};
