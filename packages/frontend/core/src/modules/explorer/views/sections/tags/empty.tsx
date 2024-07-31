import { useI18n } from '@affine/i18n';
import { TagIcon } from '@blocksuite/icons/rc';

import { ExplorerGroupEmpty } from '../../layouts/empty-layout';

export const RootEmpty = () => {
  const t = useI18n();

  return (
    <ExplorerGroupEmpty
      icon={TagIcon}
      message={t['com.affine.rootAppSidebar.tags.empty']()}
      messageTestId="slider-bar-tags-empty-message"
    />
  );
};
