import { toast } from '@affine/component';
import {
  NewPageButton,
  OperationCell,
  type OperationCellProps,
  PageList,
  PageListItem,
  type PageListItemProps,
  type PageListProps,
  PageTags,
  type PageTagsProps,
} from '@affine/component/page-list';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { PageIcon } from '@blocksuite/icons';
import { Schema, Workspace } from '@blocksuite/store';
import type { Meta, StoryFn } from '@storybook/react';
import { userEvent } from '@storybook/testing-library';
import { initEmptyPage } from '@toeverything/infra/blocksuite';
import { withRouter } from 'storybook-addon-react-router-v6';

export default {
  title: 'AFFiNE/PageList',
  parameters: {
    layout: 'fullscreen',
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta;

export const AffineOperationCell: StoryFn<OperationCellProps> = ({
  ...props
}) => <OperationCell {...props} />;

AffineOperationCell.args = {
  favorite: false,
  isPublic: true,
  onToggleFavoritePage: () => toast('Toggle favorite page'),
  onDisablePublicSharing: () => toast('Disable public sharing'),
  onRemoveToTrash: () => toast('Remove to trash'),
};
AffineOperationCell.play = async ({ canvasElement }) => {
  {
    const button = canvasElement.querySelector(
      '[data-testid="page-list-operation-button"]'
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    await userEvent.click(button);
  }
};

export const AffineNewPageButton: StoryFn<typeof NewPageButton> = ({
  ...props
}) => <NewPageButton {...props} />;
AffineNewPageButton.args = {
  createNewPage: () => toast('Create new page'),
  createNewEdgeless: () => toast('Create new edgeless'),
};

AffineNewPageButton.play = async ({ canvasElement }) => {
  const button = canvasElement.querySelector('button') as HTMLButtonElement;
  expect(button).not.toBeNull();
  const dropdown = button.querySelector('svg') as SVGSVGElement;
  expect(dropdown).not.toBeNull();
  await userEvent.click(dropdown);
};

const testTags = [
  {
    color: 'red',
    id: 'test-tag-id-0',
    value: 'foo',
  },
  {
    color: 'pink',
    id: 'test-tag-id-1',
    value: 'bar',
  },
  {
    color: 'purple',
    id: 'test-tag-id-2',
    value: 'foobar',
  },
  {
    color: 'black',
    id: 'test-tag-id-3',
    value: 'affine',
  },
  {
    color: 'orange',
    id: 'test-tag-id-4',
    value: 'blocksuite',
  },
  {
    color: 'yellow',
    id: 'test-tag-id-5',
    value: 'toeverything',
  },
  {
    color: 'green',
    id: 'test-tag-id-6',
    value: 'toeverything',
  },
  {
    color: 'blue',
    id: 'test-tag-id-7',
    value: 'toeverything',
  },
  {
    color: 'indigo',
    id: 'test-tag-id-8',
    value: 'toeverything',
  },
  {
    color: 'teal',
    id: 'test-tag-id-9',
    value: 'toeverything',
  },
  {
    color: 'cyan',
    id: 'test-tag-id-10',
    value: 'toeverything',
  },
  {
    color: 'gray',
    id: 'test-tag-id-11',
    value: 'toeverything',
  },
  {
    color: 'red',
    id: 'test-tag-id-12',
    value: 'toeverything',
  },
];

export const ListItem: StoryFn<PageListItemProps> = props => (
  <PageListItem {...props}></PageListItem>
);

ListItem.args = {
  pageId: 'test-page-id',
  title: 'Test Page Title',
  preview:
    'this is page preview and it is very long and will be truncated because it is too long and it is very long and will be truncated because it is too long',
  icon: <PageIcon />,
  to: '/hello',
  selectable: true,
  createDate: new Date('2021-01-01'),
  updatedDate: new Date('2023-08-15'),
  draggable: true,
  tags: testTags,
  favorite: true,
  selected: true,
};

ListItem.decorators = [withRouter];

export const ListItemTags: StoryFn<PageTagsProps> = props => (
  <PageTags {...props}></PageTags>
);

ListItemTags.args = {
  tags: testTags,
};

export const PageListStory: StoryFn<PageListProps> = (props, { loaded }) => {
  return <PageList {...props} {...loaded}></PageList>;
};

PageListStory.args = {
  groupBy: 'createDate',
  selectable: true,
};

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

PageListStory.loaders = [
  async () => {
    const schema = new Schema();
    schema.register(AffineSchemas).register(__unstableSchemas);
    const workspace = new Workspace({
      id: 'test-workspace-id',
      schema,
    });

    workspace.meta.setProperties({
      tags: {
        options: structuredClone(testTags),
      },
    });

    const page1 = await createAndInitPage(
      workspace,
      'This is page 1',
      'Hello World from page 1'
    );
    const page2 = await createAndInitPage(
      workspace,
      'This is page 2',
      'Hello World from page 2'
    );
    const page3 = await createAndInitPage(
      workspace,
      'This is page 3',
      'Hello World from page 3Hello World from page 3Hello World from page 3Hello World from page 3Hello World from page 3'
    );

    await createAndInitPage(
      workspace,
      'This is page 4',
      'Hello World from page 3Hello World from page 3Hello World from page 3Hello World from page 3Hello World from page 3'
    );

    page1.meta.createDate = new Date('2021-01-01').getTime();
    page2.meta.createDate = page2.meta.createDate - 3600 * 1000 * 24;
    page3.meta.createDate = page3.meta.createDate - 3600 * 1000 * 24 * 7;

    workspace.meta.pageMetas[2].tags = ['test-tag-id-0', 'test-tag-id-1'];

    return {
      blockSuiteWorkspace: workspace,
      pages: workspace.meta.pages,
    };
  },
];
