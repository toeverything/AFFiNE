import { CloseIcon } from '@blocksuite/icons/rc';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import { type MouseEventHandler, useCallback } from 'react';

import * as styles from './tag.css';
import type { TagLike } from './types';

export interface TagItemProps {
  tag: TagLike;
  idx?: number;
  maxWidth?: number | string;
  // @todo(pengx17): better naming
  mode: 'inline-tag' | 'list-tag' | 'db-label';
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
      className={styles.tag}
      data-idx={idx}
      data-tag-id={id}
      data-tag-value={value}
      title={value}
      style={{
        ...style,
        ...assignInlineVars({
          [styles.tagColorVar]: color,
        }),
      }}
    >
      <div
        style={{ maxWidth: maxWidth }}
        data-focused={focused}
        className={clsx({
          [styles.tagInlineMode]: mode === 'inline-tag',
          [styles.tagListItemMode]: mode === 'list-tag',
          [styles.tagLabelMode]: mode === 'db-label',
        })}
      >
        {mode !== 'db-label' ? <div className={styles.tagIndicator} /> : null}
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
