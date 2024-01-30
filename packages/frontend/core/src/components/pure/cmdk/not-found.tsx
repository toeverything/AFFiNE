import { SearchIcon } from '@blocksuite/icons';
import { useCommandState } from 'cmdk';
import { useAtomValue } from 'jotai';

import { cmdkQueryAtom } from './data';
import * as styles from './not-found.css';

export const NotFoundGroup = () => {
  const query = useAtomValue(cmdkQueryAtom);
  // hack: we know that the filtered count is 3 when there is no result (create page & edgeless & append to journal)
  const renderNoResult =
    useCommandState(state => state.filtered.count === 3) || false;

  if (!renderNoResult) {
    return null;
  }
  return (
    <div className={styles.notFoundContainer}>
      <div
        className={styles.notFoundTitle}
        data-testid="cmdk-search-not-found"
      >{`Search for "${query}"`}</div>
      <div className={styles.notFoundItem}>
        <div className={styles.notFoundIcon}>
          <SearchIcon />
        </div>
        <div className={styles.notFoundText}>No results found</div>
      </div>
    </div>
  );
};
