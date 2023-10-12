import type { Tag } from '@affine/env/filter';
import { Menu } from '@toeverything/components/menu';

import * as styles from './tags.css';

// fixme: This component should use popover instead of menu
export const Tags = ({ value }: { value: Tag[] }) => {
  const list = value.map(tag => {
    return (
      <div
        key={tag.id}
        className={styles.tag}
        style={{ backgroundColor: tag.color }}
      >
        {tag.value}
      </div>
    );
  });
  return (
    <Menu items={<div className={styles.tagListFull}>{list}</div>}>
      <div className={styles.tagList}>{list}</div>
    </Menu>
  );
};
