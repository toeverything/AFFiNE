import { IconButton } from '@affine/component';
import { IsFavoriteIcon } from '@affine/core/components/pure/icons';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import type { Tag } from '@affine/core/modules/tag';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { useLiveData, useService } from '@toeverything/infra';
import { type MouseEvent, useCallback } from 'react';

import { content, item, prefixIcon, suffixIcon } from './styles.css';

export const TagItem = ({ tag }: { tag: Tag }) => {
  const favAdapter = useService(CompatibleFavoriteItemsAdapter);
  const isFavorite = useLiveData(favAdapter.isFavorite$(tag.id, 'tag'));
  const color = useLiveData(tag.color$);
  const name = useLiveData(tag.value$);

  const toggle = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      favAdapter.toggle(tag.id, 'tag');
    },
    [favAdapter, tag.id]
  );

  return (
    <WorkbenchLink to={`/tag/${tag.id}`} className={item}>
      <div className={prefixIcon} style={{ color }} />
      <span className={content}>{name}</span>
      <IconButton
        className={suffixIcon}
        onClick={toggle}
        icon={<IsFavoriteIcon favorite={isFavorite} />}
        size="24"
      />
    </WorkbenchLink>
  );
};
