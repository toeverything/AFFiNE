import { useI18n } from '@affine/i18n';
import { TagIcon } from '@blocksuite/icons/rc';

import { ExplorerEmptySection } from '../../layouts/empty-section';

export const RootEmpty = () => {
  const t = useI18n();

  return (
    <ExplorerEmptySection
      icon={TagIcon}
      message={t['com.affine.rootAppSidebar.tags.empty']()}
      messageTestId="slider-bar-tags-empty-message"
    />
  );
};
