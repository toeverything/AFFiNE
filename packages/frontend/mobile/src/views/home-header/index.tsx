import { IconButton } from '@affine/component';
import { SettingsIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import { SearchButton, WorkspaceSelector } from '../../components';
import { useGlobalEvent } from '../../hooks/use-global-events';
import * as styles from './styles.css';

/**
 * Contains `Setting`, `Workspace Selector`, `Search`
 * When scrolled:
 *   - combine Setting and Workspace Selector
 *   - hide Search
 */
export const HomeHeader = () => {
  const [dense, setDense] = useState(false);

  useGlobalEvent(
    'scroll',
    useCallback(() => {
      setDense(window.scrollY > 114);
    }, [])
  );

  return (
    <div className={clsx(styles.root, { dense })}>
      <div className={styles.float}>
        <div className={styles.headerAndWsSelector}>
          <div className={styles.wsSelectorWrapper}>
            <WorkspaceSelector />
          </div>
          <div className={styles.settingWrapper}>
            <Link to="/settings">
              <IconButton
                size="24"
                style={{ padding: 10 }}
                icon={<SettingsIcon />}
              />
            </Link>
          </div>
        </div>
        <div className={styles.searchWrapper}>
          <SearchButton />
        </div>
      </div>
      <div className={styles.space} />
    </div>
  );
};
