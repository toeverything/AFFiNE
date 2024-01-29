import { Menu } from '@affine/component';
import type { Tag } from '@affine/env/filter';
import { MoreHorizontalIcon } from '@blocksuite/icons';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import { useMemo } from 'react';

import { stopPropagation, tagColorMap } from '../utils';
import * as styles from './page-tags.css';

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

export const TagItem = ({ tag, idx, mode, style }: TagItemProps) => {
  return (
    <div
      data-testid="page-tag"
      className={styles.tag}
      data-idx={idx}
      title={tag.value}
      style={style}
    >
      <div
        className={mode === 'sticky' ? styles.tagSticky : styles.tagListItem}
      >
        <div
          className={styles.tagIndicator}
          style={{
            backgroundColor: tagColorMap(tag.color),
          }}
        />
        <div className={styles.tagLabel}>{tag.value}</div>
      </div>
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

    return nTags.map((tag, idx) => (
      <TagItem key={tag.id} tag={tag} idx={idx} mode="sticky" />
    ));
  }, [maxItems, tags]);
  return (
    <div
      data-testid="page-tags"
      className={styles.root}
      style={assignInlineVars({
        [styles.hoverMaxWidth]: sanitizedWidthOnHover,
      })}
    >
      <div
        style={{
          right: hoverExpandDirection === 'left' ? 0 : 'auto',
          left: hoverExpandDirection === 'right' ? 0 : 'auto',
        }}
        className={clsx(styles.innerContainer)}
      >
        <div className={styles.innerBackdrop} />
        <div className={styles.tagsScrollContainer}>{tagsNormal}</div>
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
