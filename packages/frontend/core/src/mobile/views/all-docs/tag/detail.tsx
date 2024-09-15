import type { Tag } from '@affine/core/modules/tag';

import { AppTabs } from '../../../components';
import { AllDocList } from '../doc';
import { TagDetailHeader } from './detail-header';

export const TagDetail = ({ tag }: { tag: Tag }) => {
  return (
    <>
      <TagDetailHeader tag={tag} />
      <AllDocList tag={tag} />
      <AppTabs />
    </>
  );
};
