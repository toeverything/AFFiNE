import type { Tag } from '@affine/env/filter';
import clsx from 'clsx';
import { useEffect, useRef } from 'react';

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
  const innerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (innerContainerRef.current) {
      const innerContainer = innerContainerRef.current;
      const listener = () => {
        // on mouseleave, reset scroll position to the hoverExpandDirection
        innerContainer.scrollTo({
          left: hoverExpandDirection === 'left' ? Number.MAX_SAFE_INTEGER : 0,
          behavior: 'smooth',
        });
      };
      listener();
      innerContainerRef.current.addEventListener('mouseleave', listener);
      return () => {
        innerContainer.removeEventListener('mouseleave', listener);
      };
    }
    return;
  }, [hoverExpandDirection]);

  return (
    <div data-testid="page-tags" className={styles.root}>
      <div
        ref={innerContainerRef}
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
