import { PagePropertiesTable } from '@affine/core/components/affine/page-properties';
import { AffineSchemas } from '@blocksuite/blocks/schemas';
import { DocCollection } from '@blocksuite/store';
import { Schema } from '@blocksuite/store';
import type { StoryFn } from '@storybook/react';
import { initEmptyPage } from '@toeverything/infra';

const schema = new Schema();
schema.register(AffineSchemas);

async function createAndInitPage(
  docCollection: DocCollection,
  title: string,
  preview: string
) {
  const page = docCollection.createDoc();
  initEmptyPage(page, title);
  page.getBlockByFlavour('affine:paragraph').at(0)?.text?.insert(preview, 0);
  return page;
}

export default {
  title: 'AFFiNE/PageInfoProperties',
};

export const PageInfoProperties: StoryFn<typeof PagePropertiesTable> = (
  _,
  { loaded }
) => {
  return (
    <div style={{ height: '100vh' }}>
      <PagePropertiesTable page={loaded.page} />
    </div>
  );
};

PageInfoProperties.loaders = [
  async () => {
    const docCollection = new DocCollection({
      id: 'test-workspace-id',
      schema,
    });
    docCollection.doc.emit('sync', []);
    docCollection.meta.setProperties({
      tags: {
        options: [],
      },
    });

    const page = await createAndInitPage(
      docCollection,
      'This is page 1',
      'Hello World from page 1'
    );

    if (page.meta) {
      page.meta.updatedDate = Date.now();
    }

    return {
      page,
      workspace: docCollection,
    };
  },
];
