import { toast } from '@affine/component';
import {
  FloatingToolbar,
  List,
  type ListItem,
  type ListProps,
  ListScrollContainer,
  NewPageButton,
  PageListItem,
  type PageListItemProps,
  PageOperationCell,
  type PageOperationCellProps,
  PageTags,
  type PageTagsProps,
} from '@affine/core/components/page-list';
import { workbenchRoutes } from '@affine/core/router';
import { AffineSchemas } from '@blocksuite/blocks/schemas';
import { PageIcon, TagsIcon } from '@blocksuite/icons';
import { Schema, Workspace } from '@blocksuite/store';
import { expect } from '@storybook/jest';
import type { Meta, StoryFn } from '@storybook/react';
import { userEvent } from '@storybook/testing-library';
import { initEmptyPage } from '@toeverything/infra';
import { useState } from 'react';
import {
  reactRouterOutlets,
  reactRouterParameters,
  withRouter,
} from 'storybook-addon-react-router-v6';

export default {
  title: 'AFFiNE/PageList',
  parameters: {
    layout: 'fullscreen',
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta;

export const AffineOperationCell: StoryFn<PageOperationCellProps> = ({
  ...props
}) => <PageOperationCell {...props} />;

AffineOperationCell.args = {
  favorite: false,
  isPublic: true,
  onToggleFavoritePage: () => toast('Toggle favorite page'),
  onDisablePublicSharing: () => toast('Disable public sharing'),
  onRemoveToTrash: () => toast('Remove to trash'),
};
AffineOperationCell.parameters = {
  reactRouter: reactRouterParameters({
    routing: reactRouterOutlets(workbenchRoutes),
  }),
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
    id: 'test-tag-id-cccc',
    value: 'cccccccccccccccc',
  },
  {
    color: 'red',
    id: 'test-tag-id-a',
    value: 'a',
  },
  {
    color: 'red',
    id: 'test-tag-id-b',
    value: 'b',
  },
  {
    color: 'red',
    id: 'test-tag-id-c',
    value: 'c',
  },
  {
    color: 'red',
    id: 'test-tag-id-d',
    value: 'd',
  },
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

export const PageListItemComponent: StoryFn<PageListItemProps> = props => (
  <PageListItem {...props}></PageListItem>
);

PageListItemComponent.args = {
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
  selected: true,
};

PageListItemComponent.decorators = [withRouter];

export const ListItemTags: StoryFn<PageTagsProps> = props => (
  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
    <div style={{ width: '300px' }}>
      <PageTags {...props}></PageTags>
    </div>
  </div>
);

ListItemTags.args = {
  tags: testTags,
  hoverExpandDirection: 'left',
  widthOnHover: 600,
  maxItems: 5,
};

export const PageListStory: StoryFn<ListProps<ListItem>> = (
  props,
  { loaded }
) => {
  return (
    <ListScrollContainer
      style={{
        height: '100vh',
      }}
    >
      <List {...props} {...loaded}></List>
    </ListScrollContainer>
  );
};

PageListStory.args = {
  groupBy: 'createDate',
};

PageListStory.argTypes = {
  selectable: {
    control: 'radio',
    options: [true, 'toggle', false],
  },
  hideHeader: {
    type: 'boolean',
  },
};

async function createAndInitPage(
  workspace: Workspace,
  title: string,
  preview: string
) {
  const page = workspace.createDoc();
  initEmptyPage(page, title);
  page.getBlockByFlavour('affine:paragraph').at(0)?.text?.insert(preview, 0);
  return page;
}

PageListStory.loaders = [
  async () => {
    const schema = new Schema();
    schema.register(AffineSchemas);
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

    page1.meta!.createDate = new Date('2021-01-01').getTime();
    page2.meta!.createDate = page2.meta!.createDate - 3600 * 1000 * 24;
    page3.meta!.createDate = page3.meta!.createDate - 3600 * 1000 * 24 * 7;

    workspace.meta.docMetas[3].tags = testTags.slice(0, 3).map(t => t.id);
    workspace.meta.docMetas[2].tags = testTags.slice(0, 12).map(t => t.id);

    return {
      blockSuiteWorkspace: workspace,
      pages: workspace.meta.docs,
    };
  },
];

export const FloatingToolbarStory: StoryFn<typeof FloatingToolbar> = props => {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        height: '100vh',
        overflow: 'auto',
      }}
    >
      <button
        style={{
          border: '1px solid black',
          padding: '10px',
        }}
        onClick={() => setOpen(o => !o)}
      >
        {open ? 'hide' : 'show'}
      </button>
      <FloatingToolbar
        style={{ position: 'fixed', bottom: '20px', width: '100%' }}
        {...props}
        open={open}
      >
        <FloatingToolbar.Item>10 Selected</FloatingToolbar.Item>
        <FloatingToolbar.Separator />
        <FloatingToolbar.Button
          icon={<TagsIcon />}
          label="Add Tags"
          onClick={console.log}
        />
        <FloatingToolbar.Button
          icon={<TagsIcon />}
          label="Add Tags"
          onClick={console.log}
        />
      </FloatingToolbar>
    </div>
  );
};
