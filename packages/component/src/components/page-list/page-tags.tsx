import type { Tag } from '@affine/env/filter';

import * as styles from './page-tags.css';

export interface PageTagsProps {
  tags: Tag[];
}

const TagItem = ({ tag, idx }: { tag: Tag; idx: number }) => {
  return (
    <div data-testid="page-tag" className={styles.tag} data-idx={idx}>
      <div
        className={styles.tagIndicator}
        style={{
          backgroundColor: tag.color,
        }}
      />
      <div className={styles.tagLabel}>{tag.value}</div>
    </div>
  );
};

export const PageTags = ({ tags }: PageTagsProps) => {
  return (
    <div data-testid="page-tags" className={styles.root}>
      {tags.map((tag, idx) => (
        <TagItem key={tag.id} tag={tag} idx={idx} />
      ))}
    </div>
  );
};
