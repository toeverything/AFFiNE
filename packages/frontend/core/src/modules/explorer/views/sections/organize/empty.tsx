import { useI18n } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons/rc';

import { ExplorerEmptySection } from '../../layouts/empty-section';

export const RootEmpty = ({
  onClickCreate,
}: {
  onClickCreate?: () => void;
}) => {
  const t = useI18n();

  return (
    <ExplorerEmptySection
      icon={FolderIcon}
      message={t['com.affine.rootAppSidebar.organize.empty']()}
      messageTestId="slider-bar-organize-empty-message"
      actionText={t[
        'com.affine.rootAppSidebar.organize.empty.new-folders-button'
      ]()}
      onActionClick={onClickCreate}
    />
  );
};
