import { Menu } from '@affine/component';
import { useCatchEventCallback } from '@affine/core/components/hooks/use-catch-event-hook';
import type { Tag } from '@affine/core/modules/tag';
import { stopPropagation } from '@affine/core/utils';
import { CloseIcon, MoreHorizontalIcon } from '@blocksuite/icons/rc';
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

export const TempTagItem = ({
  value,
  color,
  maxWidth = '100%',
}: {
  value: string;
  color: string;
  maxWidth?: number | string;
}) => {
  return (
    <div className={styles.tag} title={value}>
      <div style={{ maxWidth: maxWidth }} className={styles.tagInline}>
        <div
          className={styles.tagIndicator}
          style={{
            backgroundColor: color,
          }}
        />
        <div className={styles.tagLabel}>{value}</div>
      </div>
    </div>
  );
};

export const TagItem = ({
  tag,
  idx,
  mode,
  focused,
  onRemoved,
  style,
  maxWidth,
}: TagItemProps) => {
  const value = useLiveData(tag?.value$);
  const color = useLiveData(tag?.color$);
  const handleRemove = useCatchEventCallback(() => {
    onRemoved?.();
  }, [onRemoved]);
  return (
    <div
      data-testid="page-tag"
      className={styles.tag}
      data-idx={idx}
      data-tag-id={tag?.id}
      data-tag-value={value}
      title={value}
      style={style}
    >
      <div
        style={{ maxWidth: maxWidth }}
        data-focused={focused}
        className={mode === 'inline' ? styles.tagInline : styles.tagListItem}
      >
        <div
          className={styles.tagIndicator}
          style={{
            backgroundColor: color,
          }}
        />
        <div className={styles.tagLabel}>{value}</div>
        {onRemoved ? (
          <div
            data-testid="remove-tag-button"
            className={styles.tagRemove}
            onClick={handleRemove}
          >
            <CloseIcon />
          </div>
        ) : null}
      </div>
    </div>
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
