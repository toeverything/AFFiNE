import type { HTMLAttributes, PropsWithChildren } from 'react';

import * as styles from './inline-tag-list.css';
import { TagItem } from './tag';
import type { TagLike } from './types';

interface InlineTagListProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  onRemoved?: (id: string) => void;
  tags: TagLike[];
  focusedIndex?: number;
}

export const InlineTagList = ({
  children,
  focusedIndex,
  tags,
  onRemoved,
}: PropsWithChildren<InlineTagListProps>) => {
  return (
    <div className={styles.inlineTagsContainer} data-testid="inline-tags-list">
      {tags.map((tag, idx) => {
        if (!tag) {
          return null;
        }
        const handleRemoved = onRemoved
          ? () => {
              onRemoved?.(tag.id);
            }
          : undefined;
        return (
          <TagItem
            key={tag.id}
            idx={idx}
            focused={focusedIndex === idx}
            onRemoved={handleRemoved}
            mode="inline"
            tag={tag}
          />
        );
      })}
      {children}
    </div>
  );
};
