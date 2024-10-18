import { CloseIcon } from '@blocksuite/icons/rc';
import { type MouseEventHandler, useCallback } from 'react';

import * as styles from './tag.css';
import type { TagLike } from './types';

export interface TagItemProps {
  tag: TagLike;
  idx?: number;
  maxWidth?: number | string;
  mode: 'inline' | 'list-item';
  focused?: boolean;
  onRemoved?: () => void;
  style?: React.CSSProperties;
}

export const TagItem = ({
  tag,
  idx,
  mode,
  focused,
  onRemoved,
  style,
  maxWidth,
}: TagItemProps) => {
  const { value, color, id } = tag;
  const handleRemove: MouseEventHandler<HTMLDivElement> = useCallback(
    e => {
      e.stopPropagation();
      onRemoved?.();
    },
    [onRemoved]
  );
  return (
    <div
      data-testid="page-tag"
      className={styles.tag}
      data-idx={idx}
      data-tag-id={id}
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
