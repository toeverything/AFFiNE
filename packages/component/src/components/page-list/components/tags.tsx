import type { Tag } from '@affine/env/filter';

import * as styles from './tags.css';

export const Tags = ({ value }: { value: Tag[] }) => {
  return (
    <div className={styles.tagList}>
      {value.map(tag => {
        return (
          <div
            key={tag.id}
            className={styles.tag}
            style={{ backgroundColor: tag.color }}
          >
            {tag.value}
          </div>
        );
      })}
    </div>
  );
};
