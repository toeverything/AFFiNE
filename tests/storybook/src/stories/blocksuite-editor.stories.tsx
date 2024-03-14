import { BlockSuiteEditor } from '@affine/core/components/blocksuite/block-suite-editor';
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
  const doc = docCollection.createDoc();
  initEmptyPage(doc, title);
  doc.getBlockByFlavour('affine:paragraph').at(0)?.text?.insert(preview, 0);
  return doc;
}

export default {
  title: 'AFFiNE/BlocksuiteEditor/DocEditor',
};

export const DocEditor: StoryFn<typeof BlockSuiteEditor> = (_, { loaded }) => {
  return (
    <div style={{ height: '100vh' }}>
      <BlockSuiteEditor mode="page" page={loaded.page} />
    </div>
  );
};

DocEditor.loaders = [
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

    return {
      page,
      workspace: docCollection,
    };
  },
];
