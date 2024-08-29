import { WorkbenchLink } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { SearchIcon } from '@blocksuite/icons/rc';

import * as styles from './styles.css';

export const SearchButton = () => {
  const t = useI18n();
  return (
    <WorkbenchLink to="/search">
      <div className={styles.search}>
        <SearchIcon className={styles.icon} />
        {t['Quick search']()}
      </div>
    </WorkbenchLink>
  );
};
