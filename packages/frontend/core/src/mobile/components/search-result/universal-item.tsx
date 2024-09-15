import type { QuickSearchItem } from '@affine/core/modules/quicksearch';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';

import { SearchResLabel } from './search-res-label';
import * as styles from './universal-item.css';

export interface UniversalSearchResultItemProps {
  id: string;
  item: QuickSearchItem;
  category: 'tag' | 'collection';
}
export const UniversalSearchResultItem = ({
  id,
  item,
  category,
}: UniversalSearchResultItemProps) => {
  return (
    <WorkbenchLink to={`/${category}/${id}`} className={styles.item}>
      <div className={styles.iconWrapper}>
        {item.icon &&
          (typeof item.icon === 'function' ? <item.icon /> : item.icon)}
      </div>

      <div className={styles.content}>
        <SearchResLabel item={item} />
      </div>

      <ArrowRightSmallIcon fontSize="16px" className={styles.suffixIcon} />
    </WorkbenchLink>
  );
};
