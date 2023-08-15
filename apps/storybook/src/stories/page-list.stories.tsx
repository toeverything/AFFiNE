import { Empty } from '@affine/component';
import { toast } from '@affine/component';
import type { OperationCellProps } from '@affine/component/page-list';
import { PageListTrashView } from '@affine/component/page-list';
import { PageList } from '@affine/component/page-list';
import { NewPageButton } from '@affine/component/page-list';
import { OperationCell } from '@affine/component/page-list';
import { PageIcon } from '@blocksuite/icons';
import { expect } from '@storybook/jest';
import type { StoryFn } from '@storybook/react';
import { userEvent } from '@storybook/testing-library';

export default {
  title: 'AFFiNE/PageList',
  component: PageList,
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

export const AffineAllPageList: StoryFn<typeof PageList> = ({ ...props }) => (
  <PageList {...props} />
);

AffineAllPageList.args = {
  isPublicWorkspace: false,
  onCreateNewPage: () => toast('Create new page'),
  onCreateNewEdgeless: () => toast('Create new edgeless'),
  onImportFile: () => toast('Import file'),
  list: [
    {
      pageId: '1',
      favorite: false,
      icon: <PageIcon />,
      isPublicPage: true,
      title: 'Last Page',
      tags: [],
      preview: 'this is page preview',
      createDate: new Date('2021-01-01'),
      updatedDate: new Date('2023-08-15'),
      bookmarkPage: () => toast('Bookmark page'),
      onClickPage: () => toast('Click page'),
      onDisablePublicSharing: () => toast('Disable public sharing'),
      onOpenPageInNewTab: () => toast('Open page in new tab'),
      removeToTrash: () => toast('Remove to trash'),
    },
    {
      pageId: '3',
      favorite: false,
      icon: <PageIcon />,
      isPublicPage: true,
      title:
        '1 Example Public Page with long title that will be truncated because it is too too long',
      tags: [],
      preview:
        'this is page preview and it is very long and will be truncated because it is too long and it is very long and will be truncated because it is too long',
      createDate: new Date('2021-01-01'),
      updatedDate: new Date('2021-01-02'),
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
      title: '2 Favorited Page 2021',
      tags: [],
      createDate: new Date('2021-01-02'),
      updatedDate: new Date('2021-01-01'),
      bookmarkPage: () => toast('Bookmark page'),
      onClickPage: () => toast('Click page'),
      onDisablePublicSharing: () => toast('Disable public sharing'),
      onOpenPageInNewTab: () => toast('Open page in new tab'),
      removeToTrash: () => toast('Remove to trash'),
    },
    {
      pageId: '4',
      favorite: false,
      isPublicPage: false,
      icon: <PageIcon />,
      title: 'page created in 2023-04-01',
      tags: [],
      createDate: new Date('2023-04-01'),
      updatedDate: new Date('2023-04-01'),
      bookmarkPage: () => toast('Bookmark page'),
      onClickPage: () => toast('Click page'),
      onDisablePublicSharing: () => toast('Disable public sharing'),
      onOpenPageInNewTab: () => toast('Open page in new tab'),
      removeToTrash: () => toast('Remove to trash'),
    },
  ],
};

export const AffineEmptyAllPageList: StoryFn<typeof PageList> = ({
  ...props
}) => <PageList {...props} />;

AffineEmptyAllPageList.args = {
  isPublicWorkspace: false,
  onCreateNewPage: () => toast('Create new page'),
  onCreateNewEdgeless: () => toast('Create new edgeless'),
  onImportFile: () => toast('Import file'),
  list: [],
  fallback: (
    <Empty
      title="Empty"
      description={
        <div>
          empty description, click{' '}
          <button
            onClick={() => {
              toast('click');
            }}
          >
            button
          </button>
        </div>
      }
    />
  ),
};

export const AffinePublicPageList: StoryFn<typeof PageList> = ({
  ...props
}) => <PageList {...props} />;
AffinePublicPageList.args = {
  ...AffineAllPageList.args,
  isPublicWorkspace: true,
};

export const AffineAllPageMobileList: StoryFn<typeof PageList> = ({
  ...props
}) => <PageList {...props} />;

AffineAllPageMobileList.args = AffineAllPageList.args;
AffineAllPageMobileList.parameters = {
  viewport: {
    defaultViewport: 'mobile2',
  },
};

export const AffineTrashPageList: StoryFn<typeof PageListTrashView> = ({
  ...props
}) => <PageListTrashView {...props} />;

AffineTrashPageList.args = {
  list: [
    {
      pageId: '1',
      icon: <PageIcon />,
      title: 'Example Page',
      preview: 'this is trash page preview',
      createDate: new Date('2021-01-01'),
      trashDate: new Date('2021-01-01'),
      onClickPage: () => toast('Click page'),
      onPermanentlyDeletePage: () => toast('Permanently delete page'),
      onRestorePage: () => toast('Restore page'),
    },
    {
      pageId: '2',
      icon: <PageIcon />,
      title: 'Example Page with long title that will be truncated',
      createDate: new Date('2021-01-01'),
      onClickPage: () => toast('Click page'),
      onPermanentlyDeletePage: () => toast('Permanently delete page'),
      onRestorePage: () => toast('Restore page'),
    },
  ],
};
