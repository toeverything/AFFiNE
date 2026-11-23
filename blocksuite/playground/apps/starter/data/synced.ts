import { Text, type Workspace } from '@blocksuite/affine/store';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';
import { getTestStoreManager } from '@blocksuite/integration-test/store';

import type { InitFn } from './utils';

const syncedDocMarkdown = `We share some of our findings from developing local-first software prototypes at [Ink & Switch](https://www.inkandswitch.com/) over the course of several years. These experiments test the viability of CRDTs in practice, and explore the user interface challenges for this new data model. Lastly, we suggest some next steps for moving towards local-first software: for researchers, for app developers, and a startup opportunity for entrepreneurs.

This article has also been published [in PDF format](https://www.inkandswitch.com/local-first/static/local-first.pdf) in the proceedings of the [Onward! 2019 conference](https://2019.splashcon.org/track/splash-2019-Onward-Essays). Please cite it as:

> Martin Kleppmann, Adam Wiggins, Peter van Hardenberg, and Mark McGranaghan. Local-first software: you own your data, in spite of the cloud. 2019 ACM SIGPLAN International Symposium on New Ideas, New Paradigms, and Reflections on Programming and Software (Onward!), October 2019, pages 154-178. [doi:10.1145/3359591.3359737](https://doi.org/10.1145/3359591.3359737)

We welcome your feedback: [@inkandswitch](https://twitter.com/inkandswitch) or hello@inkandswitch.com.`;

export const synced: InitFn = (collection: Workspace, id: string) => {
  const docMain =
    collection.getDoc(id)?.getStore({ id }) ??
    collection.createDoc(id).getStore({ id });

  const docSyncedPageId = 'doc:synced-page';
  const docSyncedPage = collection.createDoc(docSyncedPageId).getStore();

  const docSyncedEdgelessId = 'doc:synced-edgeless';
  const docSyncedEdgeless = collection
    .createDoc(docSyncedEdgelessId)
    .getStore();

  docMain.doc.clear();
  docSyncedPage.doc.clear();
  docSyncedEdgeless.doc.clear();

  docSyncedPage.load(() => {
    // Add root block and surface block at root level
    const rootId = docSyncedPage.addBlock('affine:page', {
      title: new Text('Synced - Page View'),
    });

    docSyncedPage.addBlock('affine:surface', {}, rootId);

    // Add note block inside root block
    const noteId = docSyncedPage.addBlock('affine:note', {}, rootId);

    // Add markdown to note block
    MarkdownTransformer.importMarkdownToBlock({
      doc: docSyncedPage,
      blockId: noteId,
      markdown: syncedDocMarkdown,
      extensions: getTestStoreManager().get('store'),
    }).catch(console.error);
  });

  docSyncedEdgeless.load(() => {
    // Add root block and surface block at root level
    const rootId = docSyncedEdgeless.addBlock('affine:page', {
      title: new Text('Synced - Edgeless View'),
    });

    docSyncedEdgeless.addBlock('affine:surface', {}, rootId);

    // Add note block inside root block
    const noteId = docSyncedEdgeless.addBlock('affine:note', {}, rootId);

    // Add markdown to note block
    MarkdownTransformer.importMarkdownToBlock({
      doc: docSyncedEdgeless,
      blockId: noteId,
      markdown: syncedDocMarkdown,
      extensions: getTestStoreManager().get('store'),
    }).catch(console.error);
  });

  docMain.load(() => {
    // Add root block and surface block at root level
    const rootId = docMain.addBlock('affine:page', {
      title: new Text('Home doc, having synced blocks'),
    });

    const surfaceId = docMain.addBlock('affine:surface', {}, rootId);
    const noteId = docMain.addBlock('affine:note', {}, rootId);

    // Add markdown to note block
    MarkdownTransformer.importMarkdownToBlock({
      doc: docMain,
      blockId: noteId,
      markdown: syncedDocMarkdown,
      extensions: getTestStoreManager().get('store'),
    })
      .then(() => {
        // Add synced block - self
        docMain.addBlock(
          'affine:paragraph',
          {
            text: new Text('Cyclic / Matryoshka synced block 👇'),
            type: 'h4',
          },
          noteId
        );

        // Add synced block - self
        docMain.addBlock(
          'affine:embed-synced-doc',
          {
            pageId: id,
          },
          noteId
        );

        // Add synced block - page view
        docMain.addBlock(
          'affine:embed-synced-doc',
          {
            pageId: docSyncedPageId,
          },
          noteId
        );

        // Add synced block - edgeless view
        docMain.addBlock(
          'affine:embed-synced-doc',
          {
            pageId: docSyncedEdgelessId,
          },
          noteId
        );

        // Add synced block - page view
        docMain.addBlock(
          'affine:embed-synced-doc',
          {
            pageId: docSyncedPageId,
            xywh: '[-1000, 0, 752, 455]',
          },
          surfaceId
        );

        // Add synced block - edgeless view
        docMain.addBlock(
          'affine:embed-synced-doc',
          {
            pageId: docSyncedEdgelessId,
            xywh: '[-1000, 500, 752, 455]',
          },
          surfaceId
        );

        // Add synced block - self
        docMain.addBlock(
          'affine:embed-synced-doc',
          {
            pageId: id,
            xywh: '[-1000, 1000, 752, 455]',
          },
          surfaceId
        );

        // Add synced block - self
        docMain.addBlock(
          'affine:embed-synced-doc',
          {
            pageId: 'doc:deleted-page',
          },
          noteId
        );
      })
      .catch(console.error);
  });

  docSyncedEdgeless.resetHistory();
  docSyncedPage.resetHistory();
  docMain.resetHistory();
};

synced.id = 'synced';
synced.displayName = 'Synced block demo';
synced.description = 'A simple demo for synced block';
