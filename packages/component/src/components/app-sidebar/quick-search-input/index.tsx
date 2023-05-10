import { getEnvironment } from '@affine/env/config';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SearchIcon } from '@blocksuite/icons';

import * as styles from './index.css';

interface QuickSearchInputProps {
  onClick?: () => void;
}

// Although it is called an input, it is actually a button.
export function QuickSearchInput({ onClick }: QuickSearchInputProps) {
  const t = useAFFiNEI18N();
  const environment = getEnvironment();
  const isMac = environment.isBrowser && environment.isMacOs;

  return (
    <div className={styles.root} onClick={onClick}>
      <SearchIcon className={styles.icon} />
      {t['Quick search']()}
      <div className={styles.spacer} />
      <div className={styles.shortcutHint}>
        {isMac ? ' ⌘ + K' : ' Ctrl + K'}
      </div>
    </div>
  );
}
