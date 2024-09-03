import { IconButton } from '@affine/component';
import { openSettingModalAtom } from '@affine/core/atoms';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { SettingsIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useSetAtom } from 'jotai';
import { useCallback, useState } from 'react';

import { SearchInput, WorkspaceSelector } from '../../components';
import { useGlobalEvent } from '../../hooks/use-global-events';
import * as styles from './styles.css';

/**
 * Contains `Setting`, `Workspace Selector`, `Search`
 * When scrolled:
 *   - combine Setting and Workspace Selector
 *   - hide Search
 */
export const HomeHeader = () => {
  const t = useI18n();
  const workbench = useService(WorkbenchService).workbench;
  const openSetting = useSetAtom(openSettingModalAtom);

  const [dense, setDense] = useState(false);

  useGlobalEvent(
    'scroll',
    useCallback(() => {
      setDense(window.scrollY > 114);
    }, [])
  );

  const navSearch = useCallback(() => {
    if (!document.startViewTransition) {
      return workbench.open('/search');
    }

    document.startViewTransition(() => {
      workbench.open('/search');
      return new Promise(resolve => setTimeout(resolve, 150));
    });
  }, [workbench]);

  return (
    <div className={clsx(styles.root, { dense })}>
      <div className={styles.float}>
        <div className={styles.headerAndWsSelector}>
          <div className={styles.wsSelectorWrapper}>
            <WorkspaceSelector />
          </div>
          <div className={styles.settingWrapper}>
            <IconButton
              onClick={() => {
                openSetting({ open: true, activeTab: 'appearance' });
              }}
              size="24"
              style={{ padding: 10 }}
              icon={<SettingsIcon />}
            />
          </div>
        </div>
        <div className={styles.searchWrapper}>
          <SearchInput placeholder={t['Quick search']()} onClick={navSearch} />
        </div>
      </div>
      <div className={styles.space} />
    </div>
  );
};
