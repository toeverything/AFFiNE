import type { Tag } from '@affine/core/modules/tag';
import { useLiveData } from '@toeverything/infra';

import { AppTabs } from '../../../components';
import { AllDocList } from '../doc';
import { TagDetailHeader } from './detail-header';
import { TagEmpty } from './empty';

export const TagDetail = ({ tag }: { tag: Tag }) => {
  const pageIds = useLiveData(tag?.pageIds$);

  if (!pageIds.length) {
    return <TagEmpty tag={tag} />;
  }
  return (
    <>
      <TagDetailHeader tag={tag} />
      <AllDocList tag={tag} />
      <AppTabs />
    </>
  );
};
