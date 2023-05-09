import { PageIcon } from '@blocksuite/icons';
import type { StoryFn } from '@storybook/react';

import { AffineLoading } from '../components/affine-loading';
import type {
  PageListProps,
  TrashListData,
} from '../components/page-list/all-page';
import { PageListTrashView } from '../components/page-list/all-page';
import PageList from '../components/page-list/all-page';
import type { OperationCellProps } from '../components/page-list/operation-cell';
import { OperationCell } from '../components/page-list/operation-cell';
import { toast } from '../ui/toast';

export default {
  title: 'AFFiNE/PageList',
  component: AffineLoading,
};

export const AffineOperationCell: StoryFn<OperationCellProps> = ({
  ...props
}) => (
  <div>
    <OperationCell {...props} />
  </div>
);

AffineOperationCell.args = {
  title: 'Example Page',
  favorite: false,
  isPublic: true,
  onToggleFavoritePage: () => toast('Toggle favorite page'),
  onDisablePublicSharing: () => toast('Disable public sharing'),
  onOpenPageInNewTab: () => toast('Open page in new tab'),
  onRemoveToTrash: () => toast('Remove to trash'),
};

export const AffineAllPageList: StoryFn<PageListProps> = ({ ...props }) => (
  <div>
    <PageList {...props} />
  </div>
);

AffineAllPageList.args = {
  isPublicWorkspace: false,
  listType: 'all',
  list: [
    {
      pageId: '1',
      favorite: false,
      icon: <PageIcon />,
      isPublicPage: true,
      title: 'Example Public Page with long title that will be truncated',
      createDate: '2021-01-01',
      updatedDate: '2021-01-01',
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
      title: 'Favorited Page',
      createDate: '2021-01-01',
      updatedDate: '2021-01-01',
      bookmarkPage: () => toast('Bookmark page'),
      onClickPage: () => toast('Click page'),
      onDisablePublicSharing: () => toast('Disable public sharing'),
      onOpenPageInNewTab: () => toast('Open page in new tab'),
      removeToTrash: () => toast('Remove to trash'),
    },
  ],
};

export const AffineTrashPageList: StoryFn<{
  list: TrashListData[];
}> = ({ ...props }) => (
  <div>
    <PageListTrashView {...props} />
  </div>
);

AffineTrashPageList.args = {
  list: [
    {
      pageId: '1',
      icon: <PageIcon />,
      title: 'Example Page',
      updatedDate: '2021-01-01',
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
