import { PageIcon } from '@blocksuite/icons';
import { expect } from '@storybook/jest';
import type { StoryFn } from '@storybook/react';
import { userEvent } from '@storybook/testing-library';

import { AffineLoading } from '../components/affine-loading';
import type {
  PageListProps,
  TrashListData,
} from '../components/page-list/all-page';
import { PageListTrashView } from '../components/page-list/all-page';
import PageList from '../components/page-list/all-page';
import { NewPageButton } from '../components/page-list/new-page-buttton';
import type { OperationCellProps } from '../components/page-list/operation-cell';
import { OperationCell } from '../components/page-list/operation-cell';
import { toast } from '../ui/toast';

export default {
  title: 'AFFiNE/PageList',
  component: AffineLoading,
};

export const AffineOperationCell: StoryFn<OperationCellProps> = ({
  ...props
}) => <OperationCell {...props} />;

AffineOperationCell.args = {
  title: 'Example Page',
  favorite: false,
  isPublic: true,
  onToggleFavoritePage: () => toast('Toggle favorite page'),
  onDisablePublicSharing: () => toast('Disable public sharing'),
  onOpenPageInNewTab: () => toast('Open page in new tab'),
  onRemoveToTrash: () => toast('Remove to trash'),
};
AffineOperationCell.play = async ({ canvasElement }) => {
  {
    const button = canvasElement.querySelector(
      '[data-testid="page-list-operation-button"]'
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    userEvent.click(button);
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
  userEvent.click(dropdown);
};

export const AffineAllPageList: StoryFn<PageListProps> = ({ ...props }) => (
  <PageList {...props} />
);

AffineAllPageList.args = {
  isPublicWorkspace: false,
  onCreateNewPage: () => toast('Create new page'),
  onCreateNewEdgeless: () => toast('Create new edgeless'),
  list: [
    {
      pageId: '1',
      favorite: false,
      icon: <PageIcon />,
      isPublicPage: true,
      title: '1 Example Public Page with long title that will be truncated',
      createDate: '2021-01-01',
      updatedDate: '2021-01-02',
      bookmarkPage: () => toast('Bookmark page'),
      onClickPage: () => toast('Click page'),
      onDisablePublicSharing: () => toast('Disable public sharing'),
      onOpenPageInNewTab: () => toast('Open page in new tab'),
      removeToTrash: () => toast('Remove to trash'),
    },
    {
      pageId: '2',
      favorite: true,
      isPublicPage: false,
      icon: <PageIcon />,
      title: '2 Favorited Page',
      createDate: '2021-01-02',
      updatedDate: '2021-01-01',
      bookmarkPage: () => toast('Bookmark page'),
      onClickPage: () => toast('Click page'),
      onDisablePublicSharing: () => toast('Disable public sharing'),
      onOpenPageInNewTab: () => toast('Open page in new tab'),
      removeToTrash: () => toast('Remove to trash'),
    },
  ],
};

export const AffineAllPageMobileList: StoryFn<PageListProps> = ({
  ...props
}) => <PageList {...props} />;

AffineAllPageMobileList.args = AffineAllPageList.args;
AffineAllPageMobileList.parameters = {
  viewport: {
    defaultViewport: 'mobile2',
  },
};

export const AffineTrashPageList: StoryFn<{
  list: TrashListData[];
}> = ({ ...props }) => <PageListTrashView {...props} />;

AffineTrashPageList.args = {
  list: [
    {
      pageId: '1',
      icon: <PageIcon />,
      title: 'Example Page',
      updatedDate: '2021-02-01',
      createDate: '2021-01-01',
      trashDate: '2021-01-01',
      onClickPage: () => toast('Click page'),
      onPermanentlyDeletePage: () => toast('Permanently delete page'),
      onRestorePage: () => toast('Restore page'),
    },
    {
      pageId: '2',
      icon: <PageIcon />,
      title: 'Example Page with long title that will be truncated',
      updatedDate: '2021-01-01',
      createDate: '2021-01-01',
      trashDate: '2021-01-01',
      onClickPage: () => toast('Click page'),
      onPermanentlyDeletePage: () => toast('Permanently delete page'),
      onRestorePage: () => toast('Restore page'),
    },
  ],
};
