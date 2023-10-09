import {
  PageList,
  PageListItem,
  type PageListItemProps,
  type PageListProps,
  PageTags,
  type PageTagsProps,
} from '@affine/component/page-list-table';
import { PageIcon } from '@blocksuite/icons';
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

export const PageListStory: StoryFn<PageListProps> = props => (
  <PageList {...props}></PageList>
);

PageListStory.args = {
  pages: [
    {
      id: 'test-page-id-1',
      title: 'Test Page Title 1',
      createDate: new Date('2021-01-01').getTime(),
      updatedDate: new Date('2023-08-15').getTime(),
      favorite: true,
      subpageIds: [],
      tags: [],
    },
    {
      id: 'test-page-id-2',
      title: 'Test Page Title 2',
      createDate: new Date('2021-01-01').getTime(),
      updatedDate: new Date('2023-08-15').getTime(),
      favorite: false,
      subpageIds: [],
      tags: [],
    },
  ],
};
