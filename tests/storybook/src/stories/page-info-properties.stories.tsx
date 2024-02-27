import { PagePropertiesTable } from '@affine/core/components/affine/page-properties';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Workspace } from '@blocksuite/store';
import { Schema } from '@blocksuite/store';
import type { StoryFn } from '@storybook/react';
import { initEmptyPage } from '@toeverything/infra';

const schema = new Schema();
schema.register(AffineSchemas).register(__unstableSchemas);

async function createAndInitPage(
  workspace: Workspace,
  title: string,
  preview: string
) {
  const page = workspace.createPage();
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
    const workspace = new Workspace({
      id: 'test-workspace-id',
      schema,
    });
    workspace.doc.emit('sync', []);
    workspace.meta.setProperties({
      tags: {
        options: [],
      },
    });

    const page = await createAndInitPage(
      workspace,
      'This is page 1',
      'Hello World from page 1'
    );

    page.meta.updatedDate = Date.now();

    return {
      page,
      workspace,
    };
  },
];
