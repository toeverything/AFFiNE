import type { StoryFn } from '@storybook/react';

import { AffineLoading } from '../components/affine-loading';
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
