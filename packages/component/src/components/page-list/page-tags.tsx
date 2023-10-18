import type { Tag } from '@affine/env/filter';
import clsx from 'clsx';

import * as styles from './page-tags.css';

export interface PageTagsProps {
  tags: Tag[];
  widthOnHover?: number | string; // max width on hover
  hoverExpandDirection?: 'left' | 'right'; // expansion direction on hover
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

export const PageTags = ({
  tags,
  widthOnHover,
  hoverExpandDirection,
}: PageTagsProps) => {
  const sanitizedWidthOnHover = widthOnHover
    ? typeof widthOnHover === 'string'
      ? widthOnHover
      : `${widthOnHover}px`
    : 'auto';
  return (
    <div data-testid="page-tags" className={styles.root}>
      <div
        style={{
          right: hoverExpandDirection === 'left' ? 0 : 'auto',
          left: hoverExpandDirection === 'right' ? 0 : 'auto',
          // @ts-expect-error it's fine
          '--hover-max-width': sanitizedWidthOnHover,
        }}
        className={clsx(styles.innerContainer)}
      >
        {tags.map((tag, idx) => (
          <TagItem key={tag.id} tag={tag} idx={idx} />
        ))}
      </div>
    </div>
  );
};
