import { useI18n } from '@affine/i18n';
import { ViewLayersIcon } from '@blocksuite/icons/rc';

import { ExplorerGroupEmpty } from '../../layouts/empty-layout';

export const RootEmpty = ({
  onClickCreate,
}: {
  onClickCreate?: () => void;
}) => {
  const t = useI18n();

  return (
    <ExplorerGroupEmpty
      icon={ViewLayersIcon}
      message={t['com.affine.collections.empty.message']()}
      messageTestId="slider-bar-collection-empty-message"
      actionText={t['com.affine.collections.empty.new-collection-button']()}
      onActionClick={onClickCreate}
    />
  );
};
