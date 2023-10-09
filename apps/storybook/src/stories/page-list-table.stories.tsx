import {
  PageList,
  PageListItem,
  type PageListItemProps,
  type PageListProps,
  PageTags,
  type PageTagsProps,
} from '@affine/component/page-list-table';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { PageIcon } from '@blocksuite/icons';
import { Schema, Workspace } from '@blocksuite/store';
import type { Meta, StoryFn } from '@storybook/react';
import { withRouter } from 'storybook-addon-react-router-v6';

export default {
  title: 'AFFiNE/PageListTable',
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta;

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

const schema = new Schema();
schema.register(AffineSchemas).register(__unstableSchemas);
const workspace = new Workspace({
  id: 'test-workspace-id',
  schema,
});

workspace.createPage();
workspace.createPage();

workspace.meta.pageMetas[0].title = 'Test Page Title 1';
workspace.meta.pageMetas[1].title = 'Test Page Title 2';

export const PageListStory: StoryFn<PageListProps> = props => (
  <PageList {...props} blockSuiteWorkspace={workspace}></PageList>
);

PageListStory.args = {
  pages: workspace.meta.pageMetas,
  groupBy: 'createDate',
};
