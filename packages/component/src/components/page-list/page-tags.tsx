import type { Tag } from '@affine/env/filter';

import * as styles from './page-tags.css';

export interface PageTagsProps {
  tags: Tag[];
  width: number; // if tags cannot fit in this width, tags will collide with each other
  maxWidth: number; // if hovering, tags will expand to this width. if it is still not enough, more tags will be hidden in the "show more tags" button
}

const TagItem = ({ tag }: { tag: Tag }) => {
  return (
    <div data-testid="page-tag" className={styles.tag}>
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
      {tags.map(tag => (
        <TagItem key={tag.id} tag={tag} />
      ))}
    </div>
  );
};
