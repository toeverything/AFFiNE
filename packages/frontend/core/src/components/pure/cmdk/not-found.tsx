import { useCommandState } from '@affine/cmdk';
import { SearchIcon } from '@blocksuite/icons';
import { useAtomValue } from 'jotai';

import { cmdkQueryAtom } from './data';
import * as styles from './not-found.css';

export const NotFoundGroup = () => {
  const query = useAtomValue(cmdkQueryAtom);
  const renderNoResult =
    useCommandState(state => state.filtered.count === 2) || false;

  if (!renderNoResult) {
    return null;
  }
  return (
    <div className={styles.notFoundContainer}>
      <div className={styles.notFoundTitle}>{`Search for "${query}"`}</div>
      <div className={styles.notFoundItem}>
        <div className={styles.notFoundIcon}>
          <SearchIcon />
        </div>
        <div className={styles.notFoundText}>No results found</div>
      </div>
    </div>
  );
};
