import type { Tag } from '@affine/env/filter';
import { MoreHorizontalIcon } from '@blocksuite/icons';
import { Menu } from '@toeverything/components/menu';
import clsx from 'clsx';
import { useEffect, useMemo, useRef } from 'react';

import * as styles from './page-tags.css';
import { stopPropagation } from './utils';

export interface PageTagsProps {
  tags: Tag[];
  maxItems?: number; // max number to show. if not specified, show all. if specified, show the first n items and add a "..." tag
  widthOnHover?: number | string; // max width on hover
  hoverExpandDirection?: 'left' | 'right'; // expansion direction on hover
}

interface TagItemProps {
  tag: Tag;
  idx: number;
  mode: 'sticky' | 'list-item';
  style?: React.CSSProperties;
}

// hack: map var(--affine-tag-xxx) colors to var(--affine-palette-line-xxx)
const tagColorMap = (color: string) => {
  const mapping: Record<string, string> = {
    'var(--affine-tag-red)': 'var(--affine-palette-line-red)',
    'var(--affine-tag-teal)': 'var(--affine-palette-line-green)',
    'var(--affine-tag-blue)': 'var(--affine-palette-line-blue)',
    'var(--affine-tag-yellow)': 'var(--affine-palette-line-yellow)',
    'var(--affine-tag-pink)': 'var(--affine-palette-line-magenta)',
    'var(--affine-tag-white)': 'var(--affine-palette-line-grey)',
    'var(--affine-tag-gray)': 'var(--affine-palette-line-grey)',
    'var(--affine-tag-orange)': 'var(--affine-palette-line-orange)',
    'var(--affine-tag-purple)': 'var(--affine-palette-line-purple)',
    'var(--affine-tag-green)': 'var(--affine-palette-line-green)',
  };
  return mapping[color] || color;
};

const TagItem = ({ tag, idx, mode, style }: TagItemProps) => {
  return (
    <div
      data-testid="page-tag"
      className={mode === 'sticky' ? styles.tagSticky : styles.tagListItem}
      data-idx={idx}
      title={tag.value}
      style={style}
    >
      <div
        className={styles.tagIndicator}
        style={{
          backgroundColor: tagColorMap(tag.color),
        }}
      />
      <div className={styles.tagLabel}>{tag.value}</div>
    </div>
  );
};

export const PageTags = ({
  tags,
  widthOnHover,
  maxItems,
  hoverExpandDirection,
}: PageTagsProps) => {
  const sanitizedWidthOnHover = widthOnHover
    ? typeof widthOnHover === 'string'
      ? widthOnHover
      : `${widthOnHover}px`
    : 'auto';
  const tagsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tagsContainerRef.current) {
      const tagsContainer = tagsContainerRef.current;
      const listener = () => {
        // on mouseleave, reset scroll position to the hoverExpandDirection
        tagsContainer.scrollTo({
          left: hoverExpandDirection === 'left' ? Number.MAX_SAFE_INTEGER : 0,
          behavior: 'smooth',
        });
      };
      listener();
      tagsContainerRef.current.addEventListener('mouseleave', listener);
      return () => {
        tagsContainer.removeEventListener('mouseleave', listener);
      };
    }
    return;
  }, [hoverExpandDirection]);

  const tagsInPopover = useMemo(() => {
    const lastTags = tags.slice(maxItems);
    return (
      <div className={styles.tagsListContainer}>
        {lastTags.map((tag, idx) => (
          <TagItem key={tag.id} tag={tag} idx={idx} mode="list-item" />
        ))}
      </div>
    );
  }, [maxItems, tags]);

  const tagsNormal = useMemo(() => {
    const nTags = maxItems ? tags.slice(0, maxItems) : tags;

    // sort tags by length
    nTags.sort((a, b) => a.value.length - b.value.length);

    const tagRightCharLength = nTags.reduceRight<number[]>(
      (acc, tag) => {
        const curr = acc[0] + Math.min(tag.value.length, 10);
        return [curr, ...acc];
      },
      [0]
    );

    tagRightCharLength.shift();

    return nTags.map((tag, idx) => (
      <TagItem
        key={tag.id}
        tag={tag}
        idx={idx}
        mode="sticky"
        style={{
          right: `calc(${tagRightCharLength[idx]}em)`,
        }}
      />
    ));
  }, [maxItems, tags]);
  return (
    <div
      data-testid="page-tags"
      className={styles.root}
      style={{
        // @ts-expect-error it's fine
        '--hover-max-width': sanitizedWidthOnHover,
      }}
    >
      <div
        style={{
          right: hoverExpandDirection === 'left' ? 0 : 'auto',
          left: hoverExpandDirection === 'right' ? 0 : 'auto',
        }}
        className={clsx(styles.innerContainer)}
      >
        <div className={styles.innerBackdrop} />
        <div className={styles.tagsScrollContainer} ref={tagsContainerRef}>
          {tagsNormal}
        </div>
        {maxItems && tags.length > maxItems ? (
          <Menu
            items={tagsInPopover}
            contentOptions={{
              onClick: stopPropagation,
            }}
          >
            <div className={styles.showMoreTag}>
              <MoreHorizontalIcon />
            </div>
          </Menu>
        ) : null}
      </div>
    </div>
  );
};
