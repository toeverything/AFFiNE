import type { DocMeta } from '@blocksuite/store';
import { useMemo } from 'react';

import { DocCard } from '../../../components';
import * as styles from './masonry.css';

// TODO(@CatsJuice): Large amount docs performance
export const MasonryDocs = ({
  items,
  showTags,
}: {
  items: DocMeta[];
  showTags?: boolean;
}) => {
  // card preview is loaded lazily, it's meaningless to calculate height
  const stacks = useMemo(() => {
    return items.reduce(
      (acc, item, i) => {
        acc[i % 2].push(item);
        return acc;
      },
      [[], []] as [DocMeta[], DocMeta[]]
    );
  }, [items]);

  return (
    <div className={styles.stacks}>
      {stacks.map((stack, i) => (
        <ul key={i} className={styles.stack}>
          {stack.map(item => (
            <DocCard showTags={showTags} key={item.id} meta={item} />
          ))}
        </ul>
      ))}
    </div>
  );
};
