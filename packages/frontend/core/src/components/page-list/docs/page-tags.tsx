import { Menu } from '@affine/component';
import { TagItem as TagItemComponent } from '@affine/component/ui/tags';
import type { Tag } from '@affine/core/modules/tag';
import { stopPropagation } from '@affine/core/utils';
import { MoreHorizontalIcon } from '@blocksuite/icons/rc';
import { LiveData, useLiveData } from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import { useMemo } from 'react';

import * as styles from './page-tags.css';

export interface PageTagsProps {
  tags: Tag[];
  maxItems?: number; // max number to show. if not specified, show all. if specified, show the first n items and add a "..." tag
  widthOnHover?: number | string; // max width on hover
  hoverExpandDirection?: 'left' | 'right'; // expansion direction on hover
}

interface TagItemProps {
  tag?: Tag;
  idx?: number;
  maxWidth?: number | string;
  mode: 'inline' | 'list-item';
  focused?: boolean;
  onRemoved?: () => void;
  style?: React.CSSProperties;
}

export const TagItem = ({ tag, ...props }: TagItemProps) => {
  const value = useLiveData(tag?.value$);
  const color = useLiveData(tag?.color$);

  if (!tag || !value || !color) {
    return null;
  }

  return (
    <TagItemComponent
      {...props}
      mode={props.mode === 'inline' ? 'inline-tag' : 'list-tag'}
      tag={{
        id: tag?.id,
        value: value,
        color: color,
      }}
    />
  );
};

const TagItemNormal = ({
  tags,
  maxItems,
}: {
  tags: Tag[];
  maxItems?: number;
}) => {
  const nTags = useMemo(() => {
    return maxItems ? tags.slice(0, maxItems) : tags;
  }, [maxItems, tags]);

  const tagsOrdered = useLiveData(
    useMemo(() => {
      return LiveData.computed(get =>
        [...nTags].sort((a, b) => get(a.value$).length - get(b.value$).length)
      );
    }, [nTags])
  );

  return useMemo(
    () =>
      tagsOrdered.map((tag, idx) => (
        <TagItem key={tag.id} tag={tag} idx={idx} mode="inline" />
      )),
    [tagsOrdered]
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
        <div className={styles.tagsScrollContainer}>
          <TagItemNormal tags={tags} maxItems={maxItems} />
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
