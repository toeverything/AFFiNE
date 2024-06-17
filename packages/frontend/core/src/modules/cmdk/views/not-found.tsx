import { QuickSearchService } from '@affine/core/modules/cmdk';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SearchIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCommandState } from 'cmdk';

import * as styles from './not-found.css';

export const NotFoundGroup = () => {
  const quickSearch = useService(QuickSearchService).quickSearch;
  const query = useLiveData(quickSearch.query$);
  // hack: we know that the filtered count is 3 when there is no result (create page & edgeless & append to journal, for mode === 'cmdk')
  const renderNoResult = useCommandState(state => state.filtered.count === 3);

  const t = useAFFiNEI18N();

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
        <div className={styles.notFoundText}>
          {t['com.affine.cmdk.no-results']()}
        </div>
      </div>
    </div>
  );
};
