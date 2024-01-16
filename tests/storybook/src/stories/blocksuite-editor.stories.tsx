import { BlockSuiteEditor } from '@affine/core/components/blocksuite/block-suite-editor';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Workspace } from '@blocksuite/store';
import { Schema } from '@blocksuite/store';
import type { StoryFn } from '@storybook/react';
import { initEmptyPage } from '@toeverything/infra/blocksuite';

const schema = new Schema();
schema.register(AffineSchemas).register(__unstableSchemas);

async function createAndInitPage(
  workspace: Workspace,
  title: string,
  preview: string
) {
  const page = workspace.createPage();
  await initEmptyPage(page, title);
  page.getBlockByFlavour('affine:paragraph').at(0)?.text?.insert(preview, 0);
  return page;
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
    const workspace = new Workspace({
      id: 'test-workspace-id',
      schema,
    });

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

    return {
      page,
      workspace,
    };
  },
];
