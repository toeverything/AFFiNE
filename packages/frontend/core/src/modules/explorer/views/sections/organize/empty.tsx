import { useI18n } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons/rc';

import { ExplorerGroupEmpty } from '../../layouts/empty-layout';

export const RootEmpty = ({
  onClickCreate,
}: {
  onClickCreate?: () => void;
}) => {
  const t = useI18n();

  return (
    <ExplorerGroupEmpty
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
