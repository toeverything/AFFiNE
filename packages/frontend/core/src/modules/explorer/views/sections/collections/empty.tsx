import { useI18n } from '@affine/i18n';
import { ViewLayersIcon } from '@blocksuite/icons/rc';

import { ExplorerEmptySection } from '../../layouts/empty-section';

export const RootEmpty = ({
  onClickCreate,
}: {
  onClickCreate?: () => void;
}) => {
  const t = useI18n();

  return (
    <ExplorerEmptySection
      icon={ViewLayersIcon}
      message={t['com.affine.collections.empty.message']()}
      messageTestId="slider-bar-collection-empty-message"
      actionText={t['com.affine.collections.empty.new-collection-button']()}
      onActionClick={onClickCreate}
    />
  );
};
