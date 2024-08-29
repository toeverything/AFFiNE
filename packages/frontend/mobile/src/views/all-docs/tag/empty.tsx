import type { Tag } from '@affine/core/modules/tag';

import { TagDetailHeader } from './detail-header';

export const TagEmpty = ({ tag }: { tag: Tag }) => {
  return (
    <>
      <TagDetailHeader tag={tag} />
      Empty
    </>
  );
};
