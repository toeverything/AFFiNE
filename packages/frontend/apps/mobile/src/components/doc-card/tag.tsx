import type { Tag } from '@affine/core/modules/tag';
import { TagService } from '@affine/core/modules/tag';
import { MoreHorizontalIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';

import * as styles from './tag.css';

const DocCardTag = ({ tag }: { tag: Tag }) => {
  const name = useLiveData(tag.value$);
  const color = useLiveData(tag.color$);

  return (
    <li
      data-name={name}
      data-color={color}
      className={styles.tag}
      style={assignInlineVars({ [styles.tagColorVar]: color })}
    >
      {name}
    </li>
  );
};

const DocCardTagsRenderer = ({ tags }: { tags: Tag[] }) => {
  return (
    <ul className={styles.tags}>
      {tags.slice(0, 2).map(tag => (
        <DocCardTag key={tag.id} tag={tag} />
      ))}
      {tags.length > 2 ? <MoreHorizontalIcon className={styles.more} /> : null}
    </ul>
  );
};

export const DocCardTags = ({ docId }: { docId: string; rows?: number }) => {
  const tagService = useService(TagService);
  const tags = useLiveData(tagService.tagList.tagsByPageId$(docId));

  if (!tags.length) return null;
  return <DocCardTagsRenderer tags={tags} />;
};
