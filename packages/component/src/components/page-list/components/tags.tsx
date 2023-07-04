import type { Tag } from '@affine/env/filter';

import Menu from '../../../ui/menu/menu';
import * as styles from './tags.css';

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
    <Menu
      pointerEnterDelay={500}
      content={<div className={styles.tagListFull}>{list}</div>}
    >
      <div className={styles.tagList}>{list}</div>
    </Menu>
  );
};
